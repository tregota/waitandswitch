Enables flipping between two states with delays to make sure conditions are stable.

Place a "Delay true" condition card after all other conditions and a "Or delay false" card (or a "Or cancel" card) alone below the "or" line.
There are no other way of building flows with these cards. They assume this order is used. If you reorder or invert them, the flow will become completely unpredictable.

After a "Delay true" has run it's course it will execute the "Then" section and afterwards won't do it again until the state is changed by an opposing card.
While "Or delay false" follows the same logic but in reverse, "Or cancel" changes the state immediatly and returns false.

This can be used to turn something both on and off with a delay.

Examples:   
- If the TV power usage is greater than 25W "Then" turn Subwoofer on after 5 seconds, "else" turn Subwoofer off after 5 seconds.
    This will turn on the Subwoofer if the TV power usage remain high and also turn it off if it remains low. Not reacting to power spikes.
- If the measured temperature of some sensitive equipment is above a set limit for 5 minutes "Then" send a notification, "else" cancel.
    This wont send a notification if the temperature is above the limit shorter than 5 minutes.