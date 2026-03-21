const variants = {
    SCHEDULED: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
    ACTIVE:    'bg-green-900/50  text-green-400  border-green-800',
    ENDED:     'bg-gray-800      text-gray-400   border-gray-700',
    CONFIRMED: 'bg-green-900/50  text-green-400  border-green-800',
    PENDING:   'bg-yellow-900/50 text-yellow-400 border-yellow-800',
    FAILED:    'bg-red-900/50    text-red-400    border-red-800',
  };
  
  const Badge = ({ status }) => (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full
                      border ${variants[status] || variants.ENDED}`}>
      {status}
    </span>
  );
  
  export default Badge;