import Image from "next/image";

export function BrandLogo({
  size = 40,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Starlens"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
