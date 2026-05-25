import { Navigate } from "react-router-dom";

/** Live presentation is integrated into the Bible Search production view. */
export function LivePresentationPage() {
  return <Navigate to="/bible" replace />;
}
