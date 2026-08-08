export const formatCurrency = (amount: number, currency: string = 'COP') => {
  const safeAmount = isNaN(amount) || amount === undefined || amount === null ? 0 : amount;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

// Simplificated Number to Spanish Words Implementation
export const numberToSpanishWords = (number: number): string => {
  const unidades = ['', 'UN ', 'DOS ', 'TRES ', 'CUATRO ', 'CINCO ', 'SEIS ', 'SIETE ', 'OCHO ', 'NUEVE '];
  const decenas = ['DIEZ ', 'ONCE ', 'DOCE ', 'TRECE ', 'CATORCE ', 'QUINCE ', 'DIECISEIS ', 'DIECISIETE ', 'DIECIOCHO ', 'DIECINUEVE ', 'VEINTE ', 'TREINTA ', 'CUARENTA ', 'CINCUENTA ', 'SESENTA ', 'SETENTA ', 'OCHENTA ', 'NOVENTA '];
  const centenas = ['', 'CIENTO ', 'DOSCIENTOS ', 'TRESCIENTOS ', 'CUATROCIENTOS ', 'QUINIENTOS ', 'SEISCIENTOS ', 'SETECIENTOS ', 'OCHOCIENTOS ', 'NOVECIENTOS '];

  let n = Math.floor(Math.abs(number));
  let output = '';

  if (n === 0) return 'CERO PESOS M/CTE';

  if (n >= 1000000) {
    output += numberToSpanishWords(Math.floor(n / 1000000)) + 'MILLONES ';
    n %= 1000000;
    // Fix singular "UN MILLONES" -> "UN MILLON" logic would go here in full version
    output = output.replace("UN MILLONES", "UN MILLÓN"); 
  }

  if (n >= 1000) {
    if (Math.floor(n / 1000) === 1) {
      output += 'MIL ';
    } else {
      output += numberToSpanishWords(Math.floor(n / 1000)) + 'MIL ';
    }
    n %= 1000;
  }

  if (n >= 100) {
    if (n === 100) {
      output += 'CIEN ';
    } else {
      output += centenas[Math.floor(n / 100)];
    }
    n %= 100;
  }

  if (n >= 20) {
    if (n >= 21 && n <= 29) {
      output += 'VEINTI' + numberToSpanishWords(n % 20);
      n = 0; 
    } else {
      output += decenas[Math.floor(n / 10) - 1];
      n %= 10;
      if (n > 0) output += 'Y ';
    }
  } else if (n >= 10) {
    output += decenas[n - 10];
    n = 0;
  }

  if (n > 0) {
    output += unidades[n];
  }

  // Final cleanup and formatting
  return (output + 'PESOS M/CTE').trim();
};
