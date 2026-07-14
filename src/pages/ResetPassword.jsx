import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  return (
    <AuthLayout
      icon={AlertTriangle}
      title="No email reset links"
      subtitle="This app runs entirely on your device"
      footer={
        <Link to="/forgot-password" className="text-primary font-medium hover:underline">
          Go to account recovery
        </Link>
      }
    >
      <p className="text-sm text-foreground text-center">
        Since there's no server or email service behind this app, password reset links don't
        exist. Head to account recovery to remove a forgotten-password account and start fresh.
      </p>
    </AuthLayout>
  );
}
