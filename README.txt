Place these delay cards after a set of conditions to make sure they stay true before performing any action.
This can be used to turn something both on and off with a delay.

Example:
If the TV power usage is greater than 25W for 5 seconds then turn Subwoofer on. Else turn Subwoofer off if less than 25W for 5 seconds. This will turn on the Subwoofer if the TV power usage remain high and also turn it off if it remains low. Not reacting to power spikes.

Notes
Maximum delay before Homey kills the flow is 89 seconds. Delays will however still continue internally and can still change the state, it will just not be able to trigger any cards.

After "Delay true" has run it's course it will execute the "Then" section (unless interrupted) and afterwards won't do it again until the state is changed by "Delay false" or "Cancel". "Delay false" follows the same logic but in reverse.

The advanced delay card can be set to be stateless which will let the flow delay true repeatedly without changing state to false inbetween.