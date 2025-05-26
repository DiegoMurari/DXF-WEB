// src/components/PageHeader.tsx
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  backTo?: string;
  backLabel?: string;
}

export function PageHeader({
  title,
  backTo = "/dashboard",
  backLabel = "Dashboard",
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <Link
        to={backTo}
        className="flex items-center text-green-700 hover:text-green-900"
      >
        <ArrowLeft className="h-6 w-6 mr-2" />
        <span className="font-medium">{backLabel}</span>
      </Link>
      <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-green-900">
        {title}
      </h1>
      <div className="w-20" /> {/* placeholder para manter o título centralizado */}
    </div>
  );
}
