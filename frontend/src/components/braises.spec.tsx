import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Braises } from './braises';

describe('Braises', () => {
  it("pose cinq braises, invisibles aux lecteurs d'écran", () => {
    const { container } = render(<Braises />);
    const calque = container.querySelector('.braises');
    expect(calque).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.braise')).toHaveLength(5);
  });
});
