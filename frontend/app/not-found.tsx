import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";

export default function NotFound() {
  return <EmptyState title="Page not found" body="That page doesn't exist." action={<ButtonLink href="/" variant="primary">Go to dashboard</ButtonLink>} />;
}
