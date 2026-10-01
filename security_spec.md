# Firestore Security Specification - Hardened

## Data Invariants
1. **Verified Access**: All write operations require a verified email (`email_verified: true`).
2. **Identity Integrity**: Document IDs must be valid. `userId` in sensitive collections must strictly match the authenticated user.
3. **Role-Based Access Control (RBAC)**: Roles are assigned by admins. Users cannot self-upgrade roles.
4. **Immutability**: Historical data like `createdAt` and `originalOwnerId` cannot be changed after creation.
5. **Relational Constraints**: Sub-resources (like Returns) must reference parent resources (Orders) that the user actually owns.

## The "Dirty Dozen" + Expanded Payloads (Audit)

| # | Collection | Action | Payload Description | Expected Result |
|---|------------|--------|---------------------|-----------------|
| 1 | `users` | `create` | Spoof `role` to `admin` during registration. | **PERMISSION_DENIED** |
| 2 | `users` | `create` | Register with an email different from the one in Auth Token. | **PERMISSION_DENIED** |
| 15| `any` | `write` | Email user with `email_verified: false` attempting a write. | **PERMISSION_DENIED** |
| 3 | `users` | `update` | Logged-in user trying to change their own `role`. | **PERMISSION_DENIED** |
| 4 | `orders` | `create` | Unverified user attempting to place an order. | **PERMISSION_DENIED** |
| 5 | `orders` | `create` | User A trying to create an order for User B (spoofing `userId`). | **PERMISSION_DENIED** |
| 6 | `orders` | `update` | Normal user trying to change the `total` or `items` after creation. | **PERMISSION_DENIED** |
| 7 | `returns` | `create` | User trying to return items from an order they don't own. | **PERMISSION_DENIED** |
| 8 | `products` | `update` | Dispatcher trying to change product `price`. | **PERMISSION_DENIED** |
| 9 | `notifications`| `create` | User trying to send a notification to another user's ID. | **PERMISSION_DENIED** |
| 10| `inventory` | `delete` | Staff (non-admin) trying to delete an inventory history record. | **PERMISSION_DENIED** |
| 11| `users` | `create` | Creating a user with an extremely long name or invalid ID. | **PERMISSION_DENIED** |
| 12| `orders` | `list` | Attempting to fetch all orders without being staff. | **PERMISSION_DENIED** (Enforced by `resource.data`) |
| 13| `any` | `write` | Write attempt from an unverified email account. | **PERMISSION_DENIED** |

## Conflict Report & Mitigation Strategy

| Risk Category | Mitigation Status | Technical Implementation |
|---------------|-------------------|--------------------------|
| **Unauthorized Access** | **HARDENED** | `isVerified()` gate + strict `resource.data` ownership checks. |
| **Privilege Escalation**| **HARDENED** | `affectedKeys().hasOnly()` prevents role changes by owners. |
| **Data Poisoning** | **HARDENED** | `.size()` limits on all string inputs and `isValidId()` on path variables. |
| **Orphaned Records** | **HARDENED** | Relational `get()` checks for cross-collection dependencies (e.g. Returns -> Orders). |
| **Denial of Wallet** | **HARDENED** | Auth and Schema checks prioritized before expensive `get()` calls. |
