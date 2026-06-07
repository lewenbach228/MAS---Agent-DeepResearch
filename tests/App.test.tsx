import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App';

describe('App', () => {
  it('renders the landing page title on /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /deepresearch agent/i }),
    ).toBeTruthy();
  });

  it('renders the report page for /r/:id routes', () => {
    render(
      <MemoryRouter initialEntries={['/r/test123']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/chargement du rapport/i),
    ).toBeTruthy();
  });
});
