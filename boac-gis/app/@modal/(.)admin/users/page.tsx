import UsersPage from "@/app/admin/users/page";

type AdminUsersModalProps = {
  searchParams?: Promise<{
    created?: string;
    error?: string;
  }>;
};

export default function AdminUsersModal({ searchParams }: AdminUsersModalProps) {
  return (
    <div
      aria-label="User administration"
      aria-modal="true"
      className="fixed inset-0 z-[2000] overflow-auto bg-zinc-950/45 backdrop-blur-sm"
      role="dialog"
    >
      <UsersPage searchParams={searchParams} />
    </div>
  );
}
