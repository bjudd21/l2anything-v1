# Values before types

The learner can explain that TypeScript annotations do not create runtime checks. Future lessons can start with the runtime value flow before naming the static type.

## Evidence

They identified that this function trusts unknown input too early:

```ts
function toUser(input: unknown) {
  return input as User;
}
```
