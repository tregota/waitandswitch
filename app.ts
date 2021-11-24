import Homey from 'homey';
import { ArgumentAutocompleteResults } from 'homey/lib/FlowCard';

type Timeout = {
  state?: boolean,
  timeoutRef?: NodeJS.Timeout,
  resolve?: (value: unknown) => void,
  reject?: (reason?: any) => void,
  wantedState?: boolean,
  orSkipOvers: number
}

type ID_Option = {
  created: string,
  name: string,
  description: string
}

class WaitAndSwitchApp extends Homey.App {
  timeouts: {[key: string]: Timeout} = {};
  lastID_Query: string = '';

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    const delayCard: Homey.FlowCardCondition = this.homey.flow.getConditionCard('waitandswitch-delay');
    delayCard.registerRunListener(({ seconds, id: { name }}) => this.conditionRunListener(name, true, seconds));
    delayCard.getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, true, delayCard));

    this.homey.flow.getConditionCard('waitandswitch-ordelay')
      .registerRunListener(({ seconds, id: { name } }) => this.conditionRunListener(name, false, seconds))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, false, delayCard));

    this.homey.flow.getConditionCard('waitandswitch-orcancel')
      .registerRunListener(({ seconds, id: { name } }) => this.conditionRunListener(name))
      .getArgument('id').registerAutocompleteListener((query) => this.getConditionIds(query, false, delayCard));

    this.log('Wait and Switch has been initialized');
 
  }

  /**
   * When an 'Or delay/cancel' card cancels a previous waiting 'Delay' card, that previous flow will end up at its 'Or' card too. 
   *   both will however be happy with how things are and abort. except cancel returns false when it is happy.
   * When a 'Delay' card cancels an 'Or Delay' card it can directly reject it since it shouldn't have more conditions
   * But when a 'Delay' card then is happy with the current state and wants to abort, it will have be increase orSkipOvers first 
   *   since a following 'Or' card otherwise would have tried to change the current state
   * @param {number} seconds 
   * @param {string} id 
   * @param {boolean} wantedState 
   * @returns 
   */
   async conditionRunListener(id: string, wantedState?: boolean, seconds?: number) {
    const timeout = this.timeouts[id];
    if (timeout) {
      if (wantedState !== true && timeout.orSkipOvers > 0) {
        // if this is an "Or"-card and orSkipOvers is above zero then decrement and abort
        this.timeouts[id].orSkipOvers--;
        throw new Error('Skipped card; flow canceled');
      }

      // if there is an active timeout or if wantedState is already the active state or if this is a cancel, then we should skip, and maybe cancel a timeout
      if (timeout.timeoutRef || wantedState === timeout.state || wantedState === undefined) {
        // if there is an active timeout and it is doing something we don't want
        if (timeout.timeoutRef && timeout.wantedState !== wantedState) {
          // then we cancel it
          this.cancelTimeout(id);
          // and reject it.
          timeout.reject && timeout.reject('Delay canceled');
          // we are now happy since the state will remain as the wanted state

          // cancels canceling a timeout abort so that not there are two flows resulting in false at once
          if (wantedState === undefined) {
            throw new Error('Delay canceled');
          }
        }
        // we are satisifed with how things are but if we want true then another card in our flow might not be happy and start a new timer, so skip it:
        if (wantedState === true) {
          this.timeouts[id].orSkipOvers++;
        }
        else if (wantedState === undefined) {
          // cancels not canceling a timeout sets the state to false and return false
          this.timeouts[id].state = false;
          return false;
        }
        throw new Error('Skipped card; same as before');
      }
    }
    else if(wantedState === undefined) {
      // no timeout to cancel
      return false;
    }

    this.log(`Delaying resolve ${wantedState} for '${id}' for ${seconds} seconds`);
    const timeoutRef = setTimeout(() => {
      const { resolve, wantedState: state } = this.timeouts[id];
      this.log(`Resolving ${state} for '${id}'`);
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
        ...(this.timeouts[id] || { orSkipOvers: 0 }),
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
      this.log(`Canceled delayed ${this.timeouts[id].wantedState} for '${id}'`);
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
  async getConditionIds(query: string, delayTrueCard: boolean, card: Homey.FlowCardCondition): Promise<any> {
    let saved: ID_Option[] = [];
    let options: ID_Option[] = [];

    // get ids used in all exising "Delay true" cards
    const savedArgs: {[key:string]: ID_Option} = await card.getArgumentValues().then((args) => args.map((arg) => arg.id).reduce((unique, cur) => cur.name in unique ? unique : { ...unique, [cur.name]: cur }, {}));

    if(delayTrueCard && query in savedArgs) {
      // but if it is a "Delay true" and we find the entered value in a previous card, we don't let the user use it
      this.lastID_Query = this.randomId();
      options.push({
        name: this.lastID_Query,
        description: 'entered ID already exists',
        created: new Date().toLocaleDateString()
      });
    }
    else if (query) {
      // save last typed query in a 'Delay' card.
      if (delayTrueCard) {
        this.lastID_Query = query;
      }
      options.push({
        name: query,
        description: 'click to confirm ID',
        created: new Date().toLocaleDateString()
      });
    }
    else if (!delayTrueCard && this.lastID_Query) {
      options.push({
        name: this.lastID_Query,
        description: 'last entered ID',
        created: new Date().toLocaleDateString()
      });
    }
    else if (delayTrueCard) {
      this.lastID_Query = this.randomId();
      options.push({
        name: this.lastID_Query,
        description: 'Enter a unique ID for this delay',
        created: new Date().toLocaleDateString()
      });
    }
    if(!delayTrueCard) {
      // if this isn't a "Delay true" card, we might want to use an id from a previous card
      const oldIDs = query ? Object.values(savedArgs).filter((id) => id.name.includes(query) && id.name !== query) : Object.values(savedArgs);
      options.push(...oldIDs.map((s) => ({
        ...s,
        description: `created ${s.created}`
      })));
    }

    return options;
  }

  randomId() {
    return Math.random().toString(36).substr(2, 7)+Math.random().toString(36).substr(2, 7);
  };
}

module.exports = WaitAndSwitchApp;
