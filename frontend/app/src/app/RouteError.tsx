import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Wordmark } from '../components/layout/Wordmark';
import { FatalError } from './Splash';

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  // A new deploy can remove old lazy chunks: reloading picks up the new ones.
  return <FatalError message="Tuvimos un problema al abrir esta pantalla. Recarga la página para seguir." onRetry={() => window.location.reload()} />;
}

export function NotFoundPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface px-4">
      <div className="bg-white rounded-[24px] p-7 max-w-[420px] w-full flex flex-col gap-4 items-start">
        <Wordmark size={26} className="text-primary" />
        <h1 className="m-0 font-display font-extrabold text-[24px] leading-[1.2]">Esta página no existe</h1>
        <p className="m-0 text-[15px] text-ink-2 leading-[1.45]">Puede que el enlace esté mal escrito o que la página ya no esté.</p>
        <Link to="/" className="h-12 px-6 rounded-full bg-primary text-white hover:text-white font-bold text-[15px] flex items-center no-underline">
          Ir a mi agenda
        </Link>
      </div>
    </div>
  );
}
