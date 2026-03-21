import { useState, useEffect } from 'react';

const useCountdown = (targetDate) => {
  const getTimeLeft = () => {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };

    return {
      hours:   Math.floor(diff / (1000 * 60 * 60)),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      expired: false,
    };
  };

  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    if (timeLeft.expired) return;
    const timer = setInterval(() => {
      const t = getTimeLeft();
      setTimeLeft(t);
      if (t.expired) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
};

export default useCountdown;