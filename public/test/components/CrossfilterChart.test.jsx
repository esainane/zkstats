import { render } from 'inferno';
import CrossfilterChart from '../../src/components/CrossfilterChart';

class Concrete extends CrossfilterChart {

};

describe('CrossfilterChart', () => {
  it('should complain when a concrete instance does not override the required methods', () => {
    const container = document.createElement('div');
    const p = new Promise(r => r());
    expect(() => render((<Concrete />), container)).toThrow();
  });
});
