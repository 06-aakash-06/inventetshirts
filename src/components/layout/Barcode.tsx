"use client";

export function Barcode() {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col items-end gap-[3px] group cursor-crosshair z-50" title="Engineered by Aakash">
      <div 
        className="overflow-hidden opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out mb-2 flex items-center justify-center max-h-0 group-hover:max-h-96"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] whitespace-nowrap text-muted-foreground group-hover:text-foreground transition-colors pt-2">Engineered by Aakash</span>
      </div>
      <div className="h-1 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300"></div>
      <div className="h-2 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300 delay-75"></div>
      <div className="h-1 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300 delay-100"></div>
      <div className="h-0.5 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300"></div>
      <div className="h-3 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300 delay-150"></div>
      <div className="h-1.5 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300"></div>
      <div className="h-0.5 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300 delay-75"></div>
      <div className="h-2 w-6 bg-foreground opacity-20 group-hover:opacity-100 transition-all duration-300 delay-200"></div>
    </div>
  );
}
