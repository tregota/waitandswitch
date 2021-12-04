Place these delay cards after a set of conditions to make sure they stay true before performing any action.
This can be used to turn something both on and off with a delay.

Examples

- If the TV power usage is greater than 25W "Then" turn Subwoofer on after 5 seconds, "else" turn Subwoofer off after 5 seconds.
    This will turn on the Subwoofer if the TV power usage remain high and also turn it off if it remains low. Not reacting to power spikes.
- If the measured temperature of some sensitive equipment is above a set limit for 1 minute "Then" send a notification, "else" cancel.
    This won't send a notification if the temperature is above the limit shorter than 1 minute.

Notes

Maximum delay before Homey kills the flow is 89 seconds.