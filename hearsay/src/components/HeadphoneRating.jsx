import { useState } from 'react';
import './HeadphoneRating.css';

export default function HeadphoneRating({ value = 0, onChange, size = 'large', showBox, compact = false, boxSizeOverride, stackOnSmall }) {
  const [hoverValue, setHoverValue] = useState(null);
  
  // Small controls stack their numeric preview on mobile by default.
  const stackOnSmallLocal = typeof stackOnSmall === 'boolean' ? stackOnSmall : (size === 'small');

  // Hover previews apply only until a rating has been selected.
  const headphoneDisplayValue = value > 0 ? value : (hoverValue !== null ? hoverValue : value);
  const boxDisplayValue = value > 0 ? value : (hoverValue !== null ? hoverValue : value);
  
  const boxSize = boxSizeOverride || size;

  // Determine box styling based on whether a rating has been selected
  const boxColorClasses = value > 0
    ? 'bg-white dark:bg-gray-900 text-black dark:text-white'
    : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400';

  const handleClick = (rating) => {
    onChange?.(rating);
  };

  const handleKey = (rating, event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(rating);
    }
  };

  const handleMouseMove = (index, event) => {
    // Only allow hover preview if no rating has been selected yet
    if (value === 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const isLeftHalf = x < rect.width / 2;
      const newValue = index + (isLeftHalf ? 0.5 : 1);
      setHoverValue(newValue);
    }
  };

  const handleMouseLeave = () => {
    // Only clear hover if no rating is selected
    if (value === 0) {
      setHoverValue(null);
    }
  };

  const HeadphoneIcon = ({ rating }) => {
    const isFull = headphoneDisplayValue >= rating;
    const isHalf = headphoneDisplayValue === rating - 0.5;

    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="transition-colors w-full h-full"
      >
        {/* Headband */}
        <path 
          d="M3 18v-6a9 9 0 0 1 18 0v6" 
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round" 
          strokeLinejoin="round"
          className={isFull || isHalf ? 'text-black dark:text-white' : 'text-gray-300 dark:text-gray-600'}
        />
        {/* Left ear cup */}
        <path
          d="M3 18a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H6a3 3 0 0 0-3 3z"
          fill={isFull || isHalf ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isFull || isHalf ? 'text-black dark:text-white' : 'text-gray-300 dark:text-gray-600'}
        />
        {/* Right ear cup */}
        <path
          d="M21 18a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1a3 3 0 0 1 3 3z"
          fill={isFull ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isFull || isHalf ? 'text-black dark:text-white' : 'text-gray-300 dark:text-gray-600'}
        />
      </svg>
    );
  };

  return (
    <div
      className={`headphone-rating headphone-rating--${size} ${stackOnSmallLocal ? 'headphone-rating--stacked' : ''}`}
      role="group"
      aria-label={`Rating control, current ${Number(boxDisplayValue).toFixed(1)} out of 5`}
    >
      <div className="headphone-rating__icons" onMouseLeave={handleMouseLeave}>
        {[0, 1, 2, 3, 4].map((index) => {
          const rating = index + 1;
          
          return (
            <button
              key={index}
              type="button"
              aria-label={`Rate ${rating} ${rating === 1 ? 'star' : 'stars'}`}
              className="headphone-rating__button"
              onMouseMove={(e) => handleMouseMove(index, e)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const isLeftHalf = x < rect.width / 2;
                handleClick(rating - (isLeftHalf ? 0.5 : 0));
              }}
              onKeyDown={(e) => handleKey(rating, e)}
            >
              <HeadphoneIcon rating={rating} />
            </button>
          );
        })}
      </div>

      {((showBox === true) || (showBox !== false && size !== 'small')) && (
        <div
          className={`headphone-rating__value headphone-rating__value--${boxSize} border-2 border-black dark:border-white ${boxColorClasses}`}
          aria-hidden="true"
          title={compact ? `${Number(boxDisplayValue).toFixed(1)}` : `${Number(boxDisplayValue).toFixed(1)}/5`}
        >
          <span>{compact ? Number(boxDisplayValue).toFixed(1) : `${Number(boxDisplayValue).toFixed(1)}/5`}</span>
        </div>
      )}
    </div>
  );
}
