import { DocumentList } from "@/components/doc/DocumentList";
import { DataTable } from "@/components/data-table";

const USERS = [
  { name: "Demo User", email: "demo@atmata.local", roles: ["admin"], active: true },
  { name: "Khalid Al-Mutawa", email: "khalid@atmata.local", roles: ["approver", "warehouse"], active: true },
  { name: "Sarah (AP)", email: "sarah@atmata.local", roles: ["ap_clerk", "approver"], active: true },
  { name: "Ahmed Al-Rashed", email: "ahmed@atmata.local", roles: ["approver"], active: true },
  { name: "Reem (Sales)", email: "reem@atmata.local", roles: ["sales_rep"], active: true },
  { name: "Audit (read-only)", email: "audit@atmata.local", roles: ["viewer"], active: true },
];

export default async function Page() {
  return (
    <DocumentList title="Users" subtitle="Roles drive permission gating across the app.">
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "roles", label: "Roles" },
          { key: "active", label: "Active?" },
        ]}
        rows={USERS.map((u) => [u.name, u.email, u.roles.join(", "), u.active ? "yes" : "no"])}
      />
    </DocumentList>
  );
}
