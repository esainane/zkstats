# Component reference

- [LoadWait](#loadwait) - A component that displays a loading spinner while waiting for a promise to resolve.

### LoadWait

A component that displays a loading spinner while waiting for a promise to resolve.

It can be changed to use a custom placeholder instead:

```jsx
<LoadWait promise={promise} placeholder={<div>Custom placeholder</div>}>Content</LoadWait>
```

**Props:**

- `children: InfernoNode` - The content to display after the promise has resolved.
- `promise: Promise` - A promise to wait for.
- `placeholder?: string|InfernoNode` - A custom placeholder to display while waiting for the promise to resolve.
