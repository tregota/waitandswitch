Place these delay cards after a set of conditions to make sure they stay true before performing any action.
This can be used to turn something both on and off with a delay.

Example

If the TV power usage is greater than 25W for 5 seconds "Then" turn Subwoofer on, "else" turn Subwoofer off if less than 25W for 5 seconds. This will turn on the Subwoofer if the TV power usage remain high and also turn it off if it remains low. Not reacting to power spikes.

Notes

Maximum delay before Homey kills the flow is 89 seconds.

After a "Delay true" has run it's course it will execute the "Then" section (unless interrupted by an "Or" card) and afterwards won't do it again until the state is changed by an "Or" card. The "Or" cards follow the same logic but in reverse. "Or cancel" is just an "Or delay false" with zero delay.
