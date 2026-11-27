export function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
      <div className="leading-none">
        <p className="text-base font-bold tracking-tight">Atlas</p>
        <p className="text-[10px] tracking-[0.2em] text-slate-600 uppercase dark:text-slate-400">Navegación</p>
      </div>
    </div>
  )
}
