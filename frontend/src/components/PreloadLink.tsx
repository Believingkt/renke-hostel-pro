import { Link, LinkProps } from "react-router-dom";
import { useRoutePreload } from "@/hooks/use-route-preload";

interface PreloadLinkProps extends LinkProps {
  children: React.ReactNode;
}

export const PreloadLink = ({ to, children, ...props }: PreloadLinkProps) => {
  const { preloadRoute } = useRoutePreload();

  const handleMouseEnter = () => {
    const path = typeof to === 'string' ? to : to.pathname || '';
    preloadRoute(path);
  };

  return (
    <Link to={to} onMouseEnter={handleMouseEnter} {...props}>
      {children}
    </Link>
  );
};
