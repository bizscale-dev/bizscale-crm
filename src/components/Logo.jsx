import Image from 'next/image';

export default function Logo({ width = 32, height = 32, style = {} }) {
  return (
    <Image
      src="/logo.png"
      alt="Bizscale Logo"
      width={width}
      height={height}
      style={{ display: 'block', ...style }}
    />
  );
}