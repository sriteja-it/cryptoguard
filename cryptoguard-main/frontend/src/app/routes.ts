import { createBrowserRouter } from "react-router";
import Dashboard from "./pages/Dashboard";
import ApiSettings from "./pages/ApiSettings";
import History from "./pages/History";
import Research from "./pages/Research";
import NotFound from "./pages/NotFound";
import Layout from "./components/Layout";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "history", Component: History },
      { path: "api-settings", Component: ApiSettings },
      { path: "research", Component: Research },
      { path: "*", Component: NotFound },
    ],
  },
]);