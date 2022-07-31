import { time } from 'console';
import Homey from 'homey';

type RunNode = {
  id: number,
  nextRun?: RunNode,
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
  runs?: RunNode
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
  largestDiff: number = 0;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    const delayCard: Homey.FlowCardCondition = this.homey.flow.getConditionCard('waitandswitch-delay');
    delayCard.registerRunListener(({ seconds, id: { name }}, flowData) => this.conditionRunListener(name, flowData, true, seconds));
    delayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, delayCard));
    delayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    })

    this.homey.flow.getConditionCard('waitandswitch-ordelay')
      .registerRunListener(({ seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, false, seconds))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, delayCard));

    this.homey.flow.getConditionCard('waitandswitch-orcancel')
      .registerRunListener(({ id: { name } }, flowState) => this.conditionRunListener(name, flowState))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, delayCard));

    const advancedDelayCard: Homey.FlowCardCondition = this.homey.flow.getConditionCard('waitandswitch-advanceddelay');
    advancedDelayCard.registerRunListener(({ type, yesno, seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, yesno, seconds, type));
    advancedDelayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, delayCard, advancedDelayCard));
    advancedDelayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    });

    const actionDelayCard: Homey.FlowCardAction = this.homey.flow.getActionCard('waitandswitch-advanceddelay');
    actionDelayCard.registerRunListener(({ type, seconds, id: { name } }, flowState) => this.conditionRunListener(name, flowState, true, seconds, type));
    actionDelayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, delayCard, advancedDelayCard));
    actionDelayCard.on('update', () => {
      this.lastID_Query = undefined;
      this.lastID_Random = undefined;
    });

    this.homey.flow.getActionCard('waitandswitch-cancel')
      .registerRunListener(({ id: { name } }, flowState) => this.conditionRunListener(name, flowState))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, delayCard));


    this.log('Wait and Switch has been initialized');
  }

  /**
   * conditionRunListener is more advanced than advancedConditionRunListener because exceptions doesn't quit the flow, it will continue below the or-line.
   * When a 'Or delay/cancel' card cancels a previous waiting 'Delay' card, that previous flow will end up at its 'Or' card too. 
   *   both will however be happy with how things are and abort.
   * When a 'Delay' card cancels a 'Or Delay' card it can directly abort it since that flow shouldn't have more conditions.
   * But when a 'Delay' card is happy with the current state and wants to abort, it will have be increase orSkipOvers first 
   *   since a following 'Or' card otherwise would have tried to change the current state
   * @param {number} seconds 
   * @param {string} id 
   * @param {boolean} wantedState 
   * @returns 
   */
   async conditionRunListener(id: string, flowState: any, wantedState?: boolean, seconds?: number, advancedType?: string) {
    const timestamp = Date.now();
    const flowStateJson = JSON.stringify(flowState);

    const timeout = this.timeouts[id];

    // find current flow run or create new one
    let currentRun: RunNode | undefined;
    let lastRun = timeout?.runs;
    if (timeout) {
      while (timeout.runs && timeout.runs.removeafter < timestamp) {
        lastRun = timeout.runs;
        timeout.runs = timeout.runs.nextRun;
      }
      if (timeout.runs) {
        currentRun = timeout.runs;
        while (currentRun && (currentRun.flowState !== flowStateJson || timestamp - currentRun.timestamp > 100)) {
          lastRun = currentRun;
          currentRun = currentRun.nextRun;
        }
      }
    }
    if (!currentRun) {
      currentRun = {
        id: (lastRun?.id || 0) + 1,
        timestamp,
        removeafter: timestamp + (seconds || 0) * 1000,
        flowState: flowStateJson,
        done: false
      }
      if (lastRun) {
        lastRun.nextRun = currentRun;
      }
      if (timeout && !timeout.runs) {
        timeout.runs = currentRun; 
      }
    }
    else if (currentRun.done) {
      // abort if run completed
      throw new Error(`#${currentRun.id} already done`);
    }
    
    // if there is an active timeout or if wantedState is already the active state, then we should skip, and maybe cancel a timeout
    if (timeout) {
      if (timeout.timeoutRef || (advancedType !== 'stateless' && wantedState === timeout.state)) {
        // if there is an active timeout and it is doing something we don't want
        if (timeout.timeoutRef && timeout.wantedState !== wantedState) {
          // then we cancel it
          this.cancelTimeout(id);
          // and reject it.
          timeout.reject && timeout.reject(`#${currentRun.id}, wanted state is ${wantedState === undefined ? false : wantedState}`);
          // we are now happy since the state will remain as the wanted state

          // a cancel should abort
          if(wantedState === undefined) {
            // when reject, make sure following cards in same flow also rejects
            currentRun.done = true;
            // reject
            this.log(`[${id}][${currentRun.id}] State change interrupted`);
            throw new Error(`#${currentRun.id} done, interrupted delayed state change`);
          }
        }

        // when a timer is first created its state is undefined, so any interrupted timer should result in a new timer
        if (this.timeouts[id].timeoutRef || (wantedState !== undefined && advancedType !== 'stateless' && this.timeouts[id].state !== undefined)) {
          // when reject, make sure following cards in same flow also rejects
          currentRun.done = true;
          // this.log(`[${id}][${currentRun.id}] State ${this.timeouts[id].timeoutRef ? 'already about to be '+(this.timeouts[id].wantedState?'true':'false') : 'already '+(this.timeouts[id].state?'true':'false')}`);
          throw new Error(`#${currentRun.id} done, state ${this.timeouts[id].timeoutRef ? 'already about to be '+(this.timeouts[id].wantedState?'true':'false') : 'already '+(this.timeouts[id].state?'true':'false')}`);
        }
      }
    }

    if(seconds === 0 || wantedState === undefined) {
      wantedState = (wantedState === undefined ? false : wantedState);
      this.log(`[${id}][${currentRun.id}] Immediately resolve ${wantedState}`);
      this.timeouts[id] = {
        ...(this.timeouts[id] || { runs: currentRun }),
        state: wantedState
      };
      return wantedState;
    }

    this.log(`[${id}][${currentRun.id}] Delaying resolve ${wantedState} for ${seconds} seconds`);
    const timeoutRef = setTimeout(() => {
      const { resolve, wantedState: state } = this.timeouts[id];
      this.log(`[${id}][${currentRun!.id}] Resolving ${state}`);
      this.timeouts[id] = {
        ...this.timeouts[id],
        state,
        timeoutRef: undefined,
        resolve: undefined,
        reject: undefined,
        wantedState: undefined
      }
      resolve && resolve(state);
    }, (seconds || 0) * 1000);

    return new Promise((resolve, reject) => {
      this.timeouts[id] = {
        ...(this.timeouts[id] || { runs: currentRun }),
        timeoutRef,
        wantedState,
        resolve, 
        reject: (reason?: any) => {
          // if interrupted, make sure following cards in same flow also rejects
          this.log(`[${id}][${currentRun!.id}] Interrupted by ${reason}`);
          currentRun!.timestamp = Date.now();
          currentRun!.done = true;
          reject(`#${currentRun!.id} interrupted by ${reason}`);
        }
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
        resolve: undefined,
        reject: undefined,
        wantedState: undefined
      }
    }
  }

  /**
   * returns a list of previously generated ids to make it easier for the user
   */
  async getConditionIds(query: string, card: Homey.FlowCardCondition, advancedCard?: Homey.FlowCardCondition): Promise<any> {
    let options: ID_Option[] = [];

    // get ids used in all exising "Delay true" cards
    const savedArgs: {[key:string]: ID_Option} = await card.getArgumentValues().then((args) => args.map((arg) => arg.id).reduce((unique, cur) => cur.name in unique ? unique : { ...unique, [cur.name]: cur }, {}));
    if (advancedCard) {
      const advancedArgs: ID_Option[] = await advancedCard.getArgumentValues().then((args) => args.map((arg) => arg.id));
      for (const arg of advancedArgs) {
        if (arg.name in savedArgs === false) {
          savedArgs[arg.name] = arg;
        }
      }
    }

    if(query in savedArgs) {
      this.lastID_Query = this.makeOption(query);
      options.push(savedArgs[query]);
    }
    else if (query) {
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

    if (!this.lastID_Random) {
      this.lastID_Random = this.makeOption()
    } 
    options.push(this.lastID_Random);

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
