# Wait and Switch
Place these delay cards after a set of conditions to make sure they stay true before performing any action.
This can be used to turn something both on and off with a delay.

![logo](https://raw.githubusercontent.com/tregota/waitandswitch/main/assets/images/large.png)

The recommended way to use this app in standard flows is to place a "Delay true" condition card after all other conditions and an "Or delay false" card (or an "Or cancel" card) alone below the "or" line.
In advanced flows it's better to use the Then-cards. There are not limitations on how to use them.

Maximum delay before Homey kills the flow is 89 seconds. Longer delays will however still continue internally and will change the state, it will just not be able to trigger any following cards. The 'State changed' trigger card can be used to work around this.

After "Delay true" has run it's course, it will set an internal state to true and return true (unless interrupted) and afterwards won't return anything again until the internal state is changed by "Delay false" or "Cancel". "Delay false" follows the same logic but in reverse.

To make a delay repeatable after completion, use the Cancel action card to reset state.

Example:   
- If the TV power usage is greater than 25W for 5 seconds then turn Subwoofer on, else turn Subwoofer off if less than 25W for 5 seconds. 
    This will turn on the Subwoofer if the TV power usage remain high and also turn it off if it remains low. Not reacting to power spikes.
