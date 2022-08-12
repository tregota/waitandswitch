Place these delay cards after a set of conditions to make sure they stay true before performing any action.
This can be used to turn something both on and off with a delay.

In standard flows, place a "Delay true" condition card after all other conditions and a "Delay false" card (or a "Cancel" card) alone below the "or" line.
In advanced flows you should use the Then-cards for the best result.

Example:
If the TV power usage changes and is greater than 25W for 5 seconds then turn Subwoofer on. Else turn Subwoofer off if less than 25W for 5 seconds. This will turn on the Subwoofer if the TV power usage remain high and also turn it off if it remains low. Not reacting to power spikes.

Notes
Maximum delay before Homey kills the flow is 89 seconds. Longer delays will however still continue internally and will change the state, it will just not be able to trigger any following cards. The 'State changed' trigger card can be used to work around this.

After "Delay true" has run it's course it will execute the "Then" section (unless interrupted) and afterwards won't do it again until the state is changed by "Delay false" or "Cancel". "Delay false" follows the same logic but in reverse.