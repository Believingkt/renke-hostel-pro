import { APP_TITLES } from "@lakeze/shared";

export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">{APP_TITLES.hq}</h1>
        <p className="text-sm text-slate-500">apps/hq · monorepo skeleton</p>
      </div>
    </main>
  );
}
