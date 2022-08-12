import Homey from 'homey';

const DEBUG = false;
const RUN_MATCH_THRESHOLD = 100;

type Run = {
  id: number,
  timestamp: number,
  removeafter: number,
  flowState: string,
  skipOvers: number,
  isAdvanced: boolean // wether or not the flow was started by a card only available in advanced flows
}

type Timeout = {
  state?: boolean,
  timeoutRef?: NodeJS.Timeout,
  resolve?: (value: unknown) => void,
  reject?: (reason?: any) => void,
  wantedState?: boolean,
  runs: Run[],
  lastRunId: number,
  timeoutRun?: Run
}

type ID_Option = {
  created: string,
  name: string,
  description: string
}

class WaitAndSwitchApp extends Homey.App {
  timeouts: {[key: string]: Timeout} = {};
  lastID_Query: ID_Option | undefined = undefined;
  lastID_Random: ID_Option | undefined = undefined;
  delayStartTrigger: Homey.FlowCardTrigger | undefined;
  stateChangeTrigger: Homey.FlowCardTrigger | undefined;

  logAs(logLevel: 'info' | 'debug', logText: string) {
    if (DEBUG || logLevel === 'info') {
      this.log(`[${logLevel}] ${logText}`);
    }
  }

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    const delayCard: Homey.FlowCardCondition = this.homey.flow.getConditionCard('waitandswitch-delay');
    const actionDelayCard: Homey.FlowCardAction = this.homey.flow.getActionCard('waitandswitch-advanceddelay');

    // condition cards

    delayCard.registerRunListener(({ seconds, id: { name }}, flowData) => this.conditionRunListener(name, flowData, true, seconds));
    delayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, actionDelayCard]));
    delayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    })

    this.homey.flow.getConditionCard('waitandswitch-ordelay')
      .registerRunListener(({ seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, false, seconds))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, actionDelayCard]));

    this.homey.flow.getConditionCard('waitandswitch-orcancel')
      .registerRunListener(({ id: { name } }, flowState) => this.conditionRunListener(name, flowState))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, actionDelayCard], false));


    // action cards

    actionDelayCard.registerRunListener(({ yesno, seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, yesno, seconds, true));
    actionDelayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, actionDelayCard]));
    actionDelayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    });

    this.homey.flow.getActionCard('waitandswitch-cancel')
      .registerRunListener(({ id: { name } }, flowState) => this.conditionRunListener(name, flowState, undefined, 0, true))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, actionDelayCard], false));

    // trigger cards

    this.stateChangeTrigger = this.homey.flow.getTriggerCard('waitandswitch-statechange');
    this.stateChangeTrigger.registerRunListener((args, state) => args.id?.name === state.id);
    this.stateChangeTrigger.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, actionDelayCard], false));

    this.delayStartTrigger = this.homey.flow.getTriggerCard('waitandswitch-delaystart');
    this.delayStartTrigger.registerRunListener((args, state) => args.id?.name === state.id);
    this.delayStartTrigger.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, actionDelayCard], false));

    this.log('Wait and Switch has been initialized');
  }

  /**
   * In a standard flow, when a 'Delay false/cancel' card cancels a previous waiting 'Delay true' card, that previous flow will end up at its 'Or' card too. 
   *   Both will however be happy with how things are and abort.
   * When a 'Delay true' card cancels a 'Delay false' card it can directly abort it since a standard flow shouldn't have more conditions.
   * But when a 'Delay true' card is happy with the current state and wants to abort, it will have to increase skipOvers
   *   since a following 'Delay false' card otherwise would have tried to change the current state
   * To try and prevent this hack from breaking advanced flows we try and match flow runs using flow state which often does the trick but depends on the card triggering the flow,
   *   for when it doesn't we have a time threshold at 100ms. Hopefully no flow triggers more often than that without having a flow state that varies.
   * @param {number} seconds 
   * @param {string} id 
   * @param {boolean} wantedState 
   * @returns 
   */
   async conditionRunListener(id: string, flowState: any, wantedState?: boolean, seconds: number = 0, advancedFlow = false) {
    const timestamp = Date.now();
    const flowStateJson = JSON.stringify(flowState);
    this.logAs('debug', `[${id}] Run with state ${flowStateJson} wants ${wantedState === undefined ? 'undefined' : wantedState ? 'true' : 'false'}`);

    const timeout = this.timeouts[id];

    // find current flow run or create new one
    // match current run by flow state and timestamp, any execution timestamp diff longer than 100ms is considered a new run
    let currentRun: Run | undefined;
    if (timeout?.runs.length > 0) {
      const stillValid = timeout.runs.filter((r) => r.removeafter >= timestamp)
      if (stillValid.length !== timeout.runs.length) {
        timeout.runs = stillValid;
      }
      currentRun = timeout.runs.reduce((matchingRun: Run | undefined, run: Run) => {
        if (run.flowState !== flowStateJson || timestamp - run.timestamp > RUN_MATCH_THRESHOLD || (matchingRun && matchingRun.timestamp > run.timestamp)) {
          return matchingRun;
        }
        return run;
      }, undefined);
    }
    if (!currentRun) {
      currentRun = {
        id: !timeout ? 1 : timeout.lastRunId + 1,
        timestamp,
        removeafter: timestamp + (seconds + 1) * 1000,
        flowState: flowStateJson,
        skipOvers: 0,
        isAdvanced: advancedFlow
      }
      if (!timeout) {
        this.timeouts[id] = {
          runs: [currentRun],
          lastRunId: currentRun.id > 9999 ? 0 : currentRun.id
        }
      }
      else {
        timeout.runs.push(currentRun);
        timeout.lastRunId = currentRun.id;
      }
    }
    else {
      this.logAs('debug', `[${id}] [${currentRun.id}] Found matching run with ${timestamp - currentRun.timestamp}ms diff, threshold: ${RUN_MATCH_THRESHOLD}ms`);
      if (!advancedFlow && wantedState !== true && currentRun.skipOvers > 0) {
        // and abort
        currentRun.skipOvers--;
        this.logAs('debug', `[${id}] [${currentRun.id}] Run is done`);
        throw new Error(`#${currentRun.id} is already done`);
      }
    }
    
    // if there is an active timeout, to either cancel or leave as is
    if (timeout?.timeoutRef) {
      // if there is an active timeout and it is doing something we don't want
      if (timeout.wantedState !== wantedState) {
        // then we cancel it
        this.cancelTimeout(id);

        // and reject it, but make sure when wanted state was true to set its run to done to true for the run. so that, in a standard flow, any following delay false cards doesn't trigger.
        if (timeout.wantedState && timeout.timeoutRun && !timeout.timeoutRun.isAdvanced) {
          timeout.timeoutRun.timestamp = Date.now();
          timeout.timeoutRun.skipOvers++;
        }
        timeout.reject && timeout.reject(`#${timeout.timeoutRun?.id} interrupted by #${currentRun.id}`);
        this.logAs('info', `[${id}] [${currentRun.id}] State change by [${timeout.timeoutRun?.id}] interrupted`);

        // a successful cancel always aborts
        if(wantedState === undefined) {
          if (advancedFlow) {
            return {
              delaycanceled: true
            };
          }
          // when aborted we need to set done to true for the run. so that, in a standard flow, any following delay false cards doesn't trigger.
          throw new Error(`#${currentRun.id} canceled #${timeout.timeoutRun?.id}`);
        }
      }
      else {
        if (wantedState && !advancedFlow) {
          // throwing errors in standard flows causes the flow to continue to the next or-field. so increase skipOvers to cause any delay cards there to abort as well.
          currentRun.timestamp = Date.now();
          currentRun.skipOvers++;
        }
        this.logAs('debug', `[${id}] [${currentRun.id}] State already about to be ${this.timeouts[id].wantedState ? 'true' : 'false'}`);
        throw new Error(`#${currentRun.id} state already about to be ${this.timeouts[id].wantedState ? 'true' : 'false'}`);
      }
    }

    // if there are no waiting delay, either because we canceled it or because there were none, check if current state already is wanted state
    if (timeout?.state === wantedState) {
      if (wantedState) {
        // throwing errors in standard flows causes the flow to continue to the next or-field. so increase skipOvers to cause any delay cards there to abort as well.
        currentRun.timestamp = Date.now();
        currentRun.skipOvers++;
      }
      this.logAs('debug', `[${id}] [${currentRun.id}] State already ${timeout?.state === undefined ? 'undefined' : timeout?.state ? 'true' : 'false'}`);
      throw new Error(`#${currentRun.id} state already ${timeout?.state === undefined ? 'undefined' : timeout?.state ? 'true' : 'false'}`);
    }

    // a cancel that doesn't cancel anything unsets state and returns false
    if (wantedState === undefined) {
      this.logAs('info', `[${id}] [${currentRun.id}] Unset state`);
      this.timeouts[id] = {
        ...this.timeouts[id],
        state: undefined
      };
      if (advancedFlow) {
        return {
          delaycanceled: false
        }; 
      }
      return false;
    }

    // immediate resolve
    if(seconds === 0) {
      this.logAs('info', `[${id}] [${currentRun.id}] Immediately resolve ${wantedState ? 'true' : 'false'}`);
      this.timeouts[id] = {
        ...this.timeouts[id],
        state: wantedState
      };
      this.stateChangeTrigger!.trigger({ state: wantedState }, { ...flowState, id, timestamp: Date.now() }); 
      if (advancedFlow) {
        return {
          delaystate: wantedState
        };
      }
      return wantedState;
    }

    // delayed resolve
    this.logAs('info', `[${id}] [${currentRun.id}] Delaying resolve ${wantedState} for ${seconds} seconds`);
    const timeoutRef = setTimeout(() => {
      const { resolve, wantedState: state } = this.timeouts[id];
      this.logAs('info', `[${id}] [${currentRun!.id}] Resolving ${state}`);
      this.timeouts[id] = {
        ...this.timeouts[id],
        state,
        timeoutRef: undefined,
        resolve: undefined,
        reject: undefined,
        wantedState: undefined,
        timeoutRun: undefined
      }
      if (resolve) {
        if (advancedFlow) {
          resolve({
            delaystate: wantedState
          });
        }
        else {
          resolve(wantedState);
        }
      }

      this.stateChangeTrigger!.trigger({ state }, { ...flowState, id, timestamp: Date.now() });
    }, seconds * 1000);

    this.delayStartTrigger!.trigger({ seconds }, { ...flowState, id, timestamp: Date.now() });

    return new Promise((resolve, reject) => {
      currentRun!.isAdvanced = advancedFlow;
      this.timeouts[id] = {
        ...this.timeouts[id],
        timeoutRun: currentRun,
        timeoutRef,
        wantedState,
        resolve, 
        reject
      };
    });
  }
  
  /**
   * @param {string} id cancel any running timeout for the id
   * @returns returns the promise reject function for any waiting card
   */
  cancelTimeout(id: string) {
    const timeout = this.timeouts[id].timeoutRef;
    if (timeout !== undefined) {
      clearTimeout(timeout);
      this.timeouts[id] = {
        ...this.timeouts[id],
        timeoutRef: undefined,
        timeoutRun: undefined,
        resolve: undefined,
        reject: undefined,
        wantedState: undefined
      }
    }
  }

  /**
   * returns a list of previously generated ids to make it easier for the user
   */
  async getConditionIds(query: string, cardTypes: Array<Homey.FlowCardCondition | Homey.FlowCardAction>, allowNew = true): Promise<any> {
    let options: ID_Option[] = [];

    // get all used ids
    const savedArgs: {[key:string]: ID_Option} = {};
    for (const flowCard of cardTypes) {
      const args: ID_Option[] = await flowCard.getArgumentValues().then((args) => args.map((arg) => arg.id));
      for (const arg of args) {
        if (arg.name in savedArgs === false) {
          savedArgs[arg.name] = arg;
        }
      }
    }

    if(query in savedArgs) {
      this.lastID_Query = this.makeOption(query);
      options.push(savedArgs[query]);
    }
    else if (query && allowNew) {
      if (query.length > 1) {
        this.lastID_Query = this.makeOption(query);
      }
      else {
        this.lastID_Query = undefined;
      }
      options.push(this.makeOption(query));
    }
    else if (this.lastID_Query) {
      options.push(this.lastID_Query);
    }

    if (allowNew || this.lastID_Random) {
      if (!this.lastID_Random) {
        this.lastID_Random = this.makeOption()
      } 
      options.push(this.lastID_Random);
    }

    // display all previous delay ids
    const oldIDs = query ? Object.values(savedArgs).filter((id) => id.name.includes(query) && id.name !== query) : Object.values(savedArgs);
    options.push(...oldIDs.map((s) => ({
      ...s,
      description: `Created ${s.created}`
    })));
    

    return options;
  }

  makeOption(query?: string) {
    return {
      name: query || this.randomId(),
      description: query ? 'Click to confirm ID' : 'Random ID',
      created: new Date().toISOString().substring(0, 10)
    }
  }
  randomId() {
    return Math.random().toString(36).substr(2, 7)+Math.random().toString(36).substr(2, 7);
  };
}

module.exports = WaitAndSwitchApp;
