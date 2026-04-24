interface Props {
  children: React.ReactNode;
  variant?: "paper" | "white";
  className?: string;
}

export function EditorialSection({ children, variant = "paper", className = "" }: Props) {
  const bg =
    variant === "paper"
      ? "bg-paper dark:bg-paper-dark"
      : "bg-white dark:bg-black";
  return (
    <section className={`${bg} ${className}`}>
      <div className="max-w-[720px] mx-auto px-6 py-24 md:py-32">{children}</div>
    </section>
  );
}
