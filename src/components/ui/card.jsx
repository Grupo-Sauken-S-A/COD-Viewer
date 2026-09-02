import * as React from "react"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`bg-white rounded-lg shadow-lg border border-gray-200 w-full max-w-7xl mx-auto overflow-hidden ${className || ''}`}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-10 ${className || ''}`}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={`text-2xl font-bold text-gray-900 ${className || ''}`}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div 
    ref={ref} 
    className={`p-6 space-y-6 overflow-auto ${className || ''}`}
    {...props} 
  />
))
CardContent.displayName = "CardContent"

export { Card, CardHeader, CardTitle, CardContent }
