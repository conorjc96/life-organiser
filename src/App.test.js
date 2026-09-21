import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders home screen with priorities, daily plan, and morning brief', () => {
  render(<App />);
  expect(screen.getByText(/home/i)).toBeInTheDocument();
  expect(screen.getByText(/priorities/i)).toBeInTheDocument();
  expect(screen.getByText(/this month/i)).toBeInTheDocument();
  expect(screen.getByText(/daily plan/i)).toBeInTheDocument();
  expect(screen.getByText(/morning brief/i)).toBeInTheDocument();
});
