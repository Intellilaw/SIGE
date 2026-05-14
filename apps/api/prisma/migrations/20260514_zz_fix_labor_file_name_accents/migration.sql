UPDATE "LaborFile"
SET "employeeName" = CASE "employeeName"
  WHEN 'Alejandra Mejia' THEN 'Alejandra Mejía'
  WHEN 'Alfonso Ramirez' THEN 'Alfonso Ramírez'
  WHEN 'Andrea Olguin' THEN 'Andrea Olguín'
  WHEN 'Axel mendoza' THEN 'Axel Mendoza'
  WHEN 'Carlos Garcï¿½a' THEN 'Carlos García'
  WHEN 'Evelyng Pï¿½rez' THEN 'Evelyng Pérez'
  WHEN 'Hector Marquina' THEN 'Héctor Marquina'
  WHEN 'Jael Lï¿½pez' THEN 'Jael López'
  WHEN 'Jesus Ramirez' THEN 'Jesús Ramírez'
  WHEN 'Martin Pantoja' THEN 'Martín Pantoja'
  WHEN 'Mayra Ordoï¿½ez' THEN 'Mayra Ordóñez'
  WHEN 'Miguel ï¿½ngel Valencia' THEN 'Miguel Ángel Valencia'
  WHEN 'Rene Viruega' THEN 'René Viruega'
  WHEN 'Verï¿½nica Mariana Salas Elisea' THEN 'Verónica Mariana Salas Elisea'
  WHEN 'Verï¿½nica Salas' THEN 'Verónica Salas'
  WHEN 'Yoseline Alvarez' THEN 'Yoseline Álvarez'
  ELSE "employeeName"
END
WHERE "employeeName" IN (
  'Alejandra Mejia',
  'Alfonso Ramirez',
  'Andrea Olguin',
  'Axel mendoza',
  'Carlos Garcï¿½a',
  'Evelyng Pï¿½rez',
  'Hector Marquina',
  'Jael Lï¿½pez',
  'Jesus Ramirez',
  'Martin Pantoja',
  'Mayra Ordoï¿½ez',
  'Miguel ï¿½ngel Valencia',
  'Rene Viruega',
  'Verï¿½nica Mariana Salas Elisea',
  'Verï¿½nica Salas',
  'Yoseline Alvarez'
);
