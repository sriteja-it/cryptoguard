import { RouterProvider } from "react-router";
import { router } from "./routes";
import { useEffect } from "react";
import ErrorBoundary from "../components/ErrorBoundary";

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}