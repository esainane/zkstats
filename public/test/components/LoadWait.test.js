import { render } from 'inferno';
import LoadWait from '../../src/components/LoadWait';

/**
 * Common setup.
 *
 * Creates a container element and the promise that will be used to test the
 * component.
 * The passed in fragment should not already provide a promise, as it will be
 * overwritten by this setup function.
 * Instead, the setup function returns a promise (which would have been
 * provided to the component as <LoadWait promise={p} />), along with the
 * container.
 */
const setup = frag => {
  const container = document.createElement('div');
  const p = new Promise(r => r());

  frag.props.promise = p;
  render(frag, container);
  return {container, p};
};

describe('LoadWait', () => {
  it('should render default initial DOM state, when no placeholder is provided', async () => {
    const {container, p} = setup(
      <LoadWait>Loaded!</LoadWait>
    );

    // Assert the initial DOM state before the promise resolves
    expect(container.innerHTML).toContain('Loading...'); // Replace with your expected initial DOM state

    await p;

    // Assert the updated DOM state after the promise resolves
    expect(container.innerHTML).toContain('Loaded');
    // Make sure it doesn't contain the old state
    expect(container.innerHTML).not.toContain('Loading...');
  });

  it('should render updated DOM state after the promise resolves (no custom placeholder provided)', async () => {
    const {container, p} = setup(
      <LoadWait>Loaded!</LoadWait>
    );

    // Assert the initial DOM state before the promise resolves
    expect(container.innerHTML).toContain('Loading...'); // Replace with your expected initial DOM state

    await p;

    // Assert the updated DOM state after the promise resolves
    expect(container.innerHTML).toContain('Loaded');
    // Make sure it doesn't contain the old state
    expect(container.innerHTML).not.toContain('Loading...');
  });

  it('should render custom initial DOM state, when provided', async () => {
    const {container, p} = setup(
      <LoadWait placeholder={(<div>Please wait...</div>)}>Loaded!</LoadWait>
    );

    // Assert the initial DOM state before the promise resolves
    expect(container.innerHTML).not.toContain('Loading...');
    expect(container.innerHTML).toContain('Please wait...');
  });

  it('should render the updated DOM state after the promise resolves (custom  placeholder provided)', async () => {
    const {container, p} = setup(
      <LoadWait placeholder={(<div>Please wait...</div>)}>Loaded!</LoadWait>
    );

    expect(container.innerHTML).toContain('Please wait...');

    // Simulate the promise resolving
    await p;

    // Assert the updated DOM state after the promise resolves
    expect(container.innerHTML).toContain('Loaded');
    // Make sure it doesn't contain the old state
    expect(container.innerHTML).not.toContain('Please wait...');
  });
});
