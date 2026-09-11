Payload shapes the frontend reads, kept beside the other descriptions of payloads.

Each of these used to be exported from the Next route handler that produced it. Those handlers were
the rollback path for routes kittiwake now serves, and deleting them on 2026-09-11 would have taken
these with them — which is the wrong reason for a type to disappear. A description of a payload
belongs next to the other descriptions of payloads, not inside one of the things that produces it,
and there is no longer a producer in this repository at all.
