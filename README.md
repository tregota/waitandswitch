# Wait and Switch
Place these delay cards after a set of conditions to make sure they stay true before performing any action.
This can be used to turn something both on and off with a delay.

![logo](https://raw.githubusercontent.com/tregota/waitandswitch/main/assets/images/large.png)

The recommended standard flow use is to place a "Delay true" condition card after all other conditions and a "Delay false" card (or a "Or cancel" card) alone below the "or" line.

Maximum delay before Homey kills the flow is 89 seconds. Delays will however still continue internally and can still change the state, it will just not be able to trigger any cards.

After "Delay true" has run it's course it will execute the "Then" section (unless interrupted) and afterwards won't do it again until the state is changed by "Delay false" or "Cancel". "Delay false" follows the same logic but in reverse.

Example:   
- If the TV power usage is greater than 25W for 5 seconds then turn Subwoofer on, else turn Subwoofer off if less than 25W for 5 seconds. 
    This will turn on the Subwoofer if the TV power usage remain high and also turn it off if it remains low. Not reacting to power spikes.
