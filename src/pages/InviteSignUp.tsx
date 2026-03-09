import { Navigate, useSearchParams } from "react-router-dom";

const InviteSignUp = () => {
  const [searchParams] = useSearchParams();
  const invite = searchParams.get("invite");
  return <Navigate to={invite ? `/signup?invite=${encodeURIComponent(invite)}` : "/signup"} replace />;
};

export default InviteSignUp;
