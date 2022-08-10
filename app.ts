import { time } from 'console';
import Homey from 'homey';

type Run = {
  id: number,
  timestamp: number,
  removeafter: number,
  flowState: string,
  done: boolean
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

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    const delayCard: Homey.FlowCardCondition = this.homey.flow.getConditionCard('waitandswitch-delay');
    const advancedDelayCard: Homey.FlowCardCondition = this.homey.flow.getConditionCard('waitandswitch-advanceddelay');
    const actionDelayCard: Homey.FlowCardAction = this.homey.flow.getActionCard('waitandswitch-advanceddelay');

    delayCard.registerRunListener(({ seconds, id: { name }}, flowData) => this.conditionRunListener(name, flowData, true, seconds));
    delayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard]));
    delayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    })

    this.homey.flow.getConditionCard('waitandswitch-ordelay')
      .registerRunListener(({ seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, false, seconds))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard]));

    this.homey.flow.getConditionCard('waitandswitch-orcancel')
      .registerRunListener(({ id: { name } }, flowState) => this.conditionRunListener(name, flowState))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard], false));

    advancedDelayCard.registerRunListener(({ yesno, seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, yesno, seconds));
    advancedDelayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard]));
    advancedDelayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    });

    actionDelayCard.registerRunListener(({ yesno, seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, yesno, seconds, true));
    actionDelayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard]));
    actionDelayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    });

    this.homey.flow.getActionCard('waitandswitch-cancel')
      .registerRunListener(({ id: { name } }, flowState) => this.conditionRunListener(name, flowState, undefined, 0, true))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard], false));


    this.stateChangeTrigger = this.homey.flow.getTriggerCard('waitandswitch-statechange');
    this.stateChangeTrigger.registerRunListener((args, state) => args.id?.name === state.id);
    this.stateChangeTrigger.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard], false));

    this.delayStartTrigger = this.homey.flow.getTriggerCard('waitandswitch-delaystart');
    this.delayStartTrigger.registerRunListener((args, state) => args.id?.name === state.id);
    this.delayStartTrigger.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, [delayCard, advancedDelayCard, actionDelayCard], false));

    this.log('Wait and Switch has been initialized');
  }

  /**
   * When a 'Delay false/cancel' card cancels a previous waiting 'Delay true' card, in a standard flow, that previous flow will end up at its 'Or' card too. 
   *   both will however be happy with how things are and abort.
   * When a 'Delay true' card cancels a 'Delay false' card it can directly abort it since a standard flow shouldn't have more conditions.
   * But when a 'Delay true' card is happy with the current state and wants to abort, it will have to set currentRun.done to true
   *   since a following 'Delay false' card otherwise would have tried to change the current state
   * @param {number} seconds 
   * @param {string} id 
   * @param {boolean} wantedState 
   * @returns 
   */
   async conditionRunListener(id: string, flowState: any, wantedState?: boolean, seconds: number = 0, action = false) {
    const timestamp = Date.now();
    const flowStateJson = JSON.stringify(flowState);

    const timeout = this.timeouts[id];

    // find current flow run or create new one
    let currentRun: Run | undefined;
    if (timeout?.runs.length > 0) {
      const stillValid = timeout.runs.filter((r) => r.removeafter >= timestamp)
      if (stillValid.length !== timeout.runs.length) {
        timeout.runs = stillValid;
      }
      currentRun = timeout.runs.reduce((matchingRun: Run | undefined, run: Run) => {
        if (run.flowState !== flowStateJson || timestamp - run.timestamp > 100 || (matchingRun && matchingRun.timestamp > run.timestamp)) {
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
        done: false
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
    else if (!action && currentRun.done) {
      // and abort
      // this.log(`[${id}] [${currentRun.id}] already done`);
      throw new Error(`#${currentRun.id} already done`);
    }
    
    // if there is an active timeout or if wantedState is already the active state, then we should skip, and maybe cancel a timeout
    if (timeout) {
      if (timeout.timeoutRef || wantedState === timeout.state) {
        // if there is an active timeout and it is doing something we don't want
        if (timeout.timeoutRef && timeout.wantedState !== wantedState) {
          // then we cancel it
          this.cancelTimeout(id);

          // and reject it, but make sure when wanted state was true to set its run to done to true for the run. so that, in a standard flow, any following delay false cards doesn't trigger.
          if (timeout.wantedState === true && timeout.timeoutRun) {
            timeout.timeoutRun.timestamp = Date.now();
            timeout.timeoutRun.done = true;
          }
          timeout.reject && timeout.reject(`#${timeout.timeoutRun?.id} interrupted by #${currentRun.id}`);
          this.log(`[${id}] [${currentRun.id}] State change by [${timeout.timeoutRun?.id}] interrupted`);

          // a successful cancel always aborts
          if(wantedState === undefined) {
            // when aborted we need to set done to true for the run. so that, in a standard flow, any following delay false cards doesn't trigger.
            throw new Error(`#${currentRun.id} canceled #${timeout.timeoutRun?.id}`);
          }
        }

        // when a timer is first created, its state is undefined. so any interrupted timer should result in a new timer
        if (this.timeouts[id].timeoutRef || (wantedState !== undefined && this.timeouts[id].state !== undefined)) {
          // when aborted and wanted state is true we need to set done to true for the run. so that, in a standard flow, any following delay false cards doesn't trigger.
          if (wantedState) {
            currentRun.timestamp = Date.now();
            currentRun.done = true;
          }
          // this.log(`[${id}] [${currentRun.id}] State ${this.timeouts[id].timeoutRef ? 'already about to be '+(this.timeouts[id].wantedState?'true':'false') : 'already '+(this.timeouts[id].state?'true':'false')}`);
          throw new Error(`#${currentRun.id} state ${this.timeouts[id].timeoutRef ? 'already about to be '+(this.timeouts[id].wantedState?'true':'false') : 'already '+(this.timeouts[id].state?'true':'false')}`);
        }
      }
    }

    if (wantedState === undefined) {
      this.log(`[${id}] [${currentRun.id}] Unset state`);
      this.timeouts[id] = {
        ...this.timeouts[id],
        state: undefined
      };
      return false;
    }

    if(seconds === 0) {
      this.log(`[${id}] [${currentRun.id}] Immediately resolve ${wantedState}`);
      this.timeouts[id] = {
        ...this.timeouts[id],
        state: wantedState
      };
      this.stateChangeTrigger!.trigger({ state: wantedState }, { id }); 
      return wantedState;
    }

    this.log(`[${id}] [${currentRun.id}] Delaying resolve ${wantedState} for ${seconds} seconds`);
    const timeoutRef = setTimeout(() => {
      const { resolve, wantedState: state } = this.timeouts[id];
      this.log(`[${id}] [${currentRun!.id}] Resolving ${state}`);
      this.timeouts[id] = {
        ...this.timeouts[id],
        state,
        timeoutRef: undefined,
        resolve: undefined,
        reject: undefined,
        wantedState: undefined,
        timeoutRun: undefined
      }
      resolve && resolve(state);

      this.stateChangeTrigger!.trigger({ state }, { id });
    }, seconds * 1000);

    this.delayStartTrigger!.trigger({ seconds }, { id });

    return new Promise((resolve, reject) => {
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
