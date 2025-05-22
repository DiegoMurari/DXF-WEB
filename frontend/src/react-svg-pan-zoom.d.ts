// src/react-svg-pan-zoom.d.ts
declare module "react-svg-pan-zoom" {
    import * as React from "react";
  
    export const TOOL_AUTO: string;
  
    export interface ReactSVGPanZoomProps {
      width: number;
      height: number;
      value?: any;
      onChangeValue?: (value: any) => void;
      tool?: string;
      detectAutoPan?: boolean;
      background?: string;
      SVGBackground?: string;
      children?: React.ReactNode;
      /**
       * Posições: 'none', 'left', 'right', 'top', 'bottom'
       */
      toolbarPosition?: "none" | "left" | "right" | "top" | "bottom";
      miniaturePosition?: "none" | "left" | "right" | "top" | "bottom";
    }
  
    export class ReactSVGPanZoom extends React.Component<ReactSVGPanZoomProps> {}
  }
  