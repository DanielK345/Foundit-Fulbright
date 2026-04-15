import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the academic curator shell", () => {
  render(<App />);
  expect(screen.getByText(/academic curator/i)).toBeInTheDocument();
  expect(screen.getByText(/configure your source material/i)).toBeInTheDocument();
});
