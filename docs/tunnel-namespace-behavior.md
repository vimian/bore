# Tunnel Namespace Behavior

This note captures the intended product behavior for namespace ownership in `bore`.

## Rules

- A top-level namespace such as `pia` is reserved to the user, not to a specific device or port.
- Reserving `pia` implicitly reserves the full descendant namespace for that user:
  - `pia.example.com`
  - `api.pia.example.com`
  - `*.pia.example.com`
- Other users must never be able to reserve nested names under another user's reserved namespace, such as `api.pia`.

## Lifecycle

- `bore up <port>` should let the user reuse one of their reserved namespaces that is not currently active on another live device, or ask for a newly generated namespace.
- If a user shuts down a computer and later starts `bore` again, the client should keep using the same reserved namespace for that tunnel when possible.
- `bore down <port>` stops the tunnel claim for that port, but does not delete the user's reserved namespace.
- If the user later runs `bore up` on a different port, they should be able to reuse the old reserved namespace.
- `bore release <namespace>` permanently deletes an unused reserved namespace and every reserved child host under it.
- A namespace can only be released after every tunnel claim for it has been removed with `bore down`.

## Multi-device behavior

- A user may reuse any of their reserved namespaces on another device when that namespace is not actively claimed by a live device.
- If device B reuses a namespace while device A is offline, and device A later reconnects with the same namespace, device A should become `blocked` until device B disconnects or releases that namespace.
- Releasing can happen because the active device goes offline or because it runs `bore down <port>` for the tunnel using that namespace.

## CLI expectations

- `bore up <port>` should prompt for reuse vs generating a new namespace when reusable reserved namespaces exist.
- `bore release <namespace>` should let the user remove a no-longer-needed reserved namespace once it has no claim records.
- `bore reassign <port>` should let the user switch a running tunnel to a different reserved namespace that is not active elsewhere, or generate a new one.
