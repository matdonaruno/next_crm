'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipPortal = ({ children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Portal>) => (
  <TooltipPrimitive.Portal {...props}>{children}</TooltipPrimitive.Portal>
);

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 5, ...props }, ref) => (
  <TooltipPortal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md bg-primary text-white px-2 py-1 text-sm shadow-md outline-none whitespace-nowrap',
        'writing-mode-horizontal-tb text-orientation-mixed',
        'whitespace-nowrap',
        className
      )}
      style={{
        writingMode: 'horizontal-tb',
        whiteSpace: 'nowrap',
        textOrientation: 'mixed',
        ...props.style,
      }}
      {...props}
    />
  </TooltipPortal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
