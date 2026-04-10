import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useState, useEffect } from "react";
import { getCurrentUser } from "./utils/firebaseAuth";
import { ROUTES } from "./utils/routes";
import AuthPage from "./components/AuthPage";
import AccountPage from "./components/AccountPage";
import JourneyPlanner from "./components/JourneyPlanner";
import SingleRouteView from "./components/SingleRouteView";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const user = await getCurrentUser();
      setIsAuthenticated(!!user);
      setLoading(false);
    };

    loadSession();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-bg">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path={ROUTES.ROOT}
          element={
            isAuthenticated ? (
              <Navigate to={ROUTES.JOURNEY_PLANNER} />
            ) : (
              <Navigate to={ROUTES.LOGIN} />
            )
          }
        />
        <Route
          path={ROUTES.LOGIN}
          element={
            isAuthenticated ? (
              <Navigate to={ROUTES.JOURNEY_PLANNER} />
            ) : (
              <AuthPage setIsAuthenticated={setIsAuthenticated} />
            )
          }
        />
        <Route
          path={ROUTES.ACCOUNT}
          element={
            isAuthenticated ? <AccountPage /> : <Navigate to={ROUTES.LOGIN} />
          }
        />
        <Route
          path="/preferences"
          element={<Navigate to={ROUTES.ACCOUNT} replace />}
        />
        <Route
          path={ROUTES.JOURNEY_PLANNER}
          element={
            isAuthenticated ? (
              <JourneyPlanner />
            ) : (
              <Navigate to={ROUTES.LOGIN} />
            )
          }
        />
        <Route
          path={ROUTES.JOURNEY_ALIAS}
          element={
            isAuthenticated ? (
              <JourneyPlanner />
            ) : (
              <Navigate to={ROUTES.LOGIN} />
            )
          }
        />
        <Route
          path={ROUTES.ROUTE_DETAILS}
          element={
            isAuthenticated ? (
              <SingleRouteView />
            ) : (
              <Navigate to={ROUTES.LOGIN} />
            )
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.ROOT} replace />} />
      </Routes>
    </Router>
  );
}

export default App;
