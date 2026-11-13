import React from 'react';
import {
  X,
  FlaskConical,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface AcceptanceTestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadTestCase: (testCase: {
    query: string;
    targetTab?: 'cotizaciones' | 'sku-finder';
  }) => void;
}

interface AcceptanceTest {
  id: string;
  title: string;
  category: 'Producto Real' | 'Lógica de Envío' | 'Buscador SKU' | 'Reglas Visuales';
  description: string;
  query: string;
  targetTab?: 'cotizaciones' | 'sku-finder';
  expectedResult: string;
  officialSkuCheck?: string;
}

const ACCEPTANCE_TESTS: AcceptanceTest[] = [
  {
    id: 'test-montessori',
    title: 'Prueba Prioritaria: Cama Montessori 1½ plazas («cama montesorri 1.5 plaz»)',
    category: 'Producto Real',
    description:
      'Identifica correctamente el producto infantil en categoría Muebles/Kids incluso con error ortográfico («montesorri»). Medida 1½ plaza (105 × 190 cm), foto oficial y precio verificado en Chaide.',
    query: 'cama montesorri 1.5 plaz',
    expectedResult:
      'Cama Montessori, 1½ plaza (SKU 5445 azul u opción disponible). Promo: $465,16, Normal: $708,00, Descuento: ~34%. Envío gratis automático (> $350). Total: $465,16.',
    officialSkuCheck: 'SKU 5445 en chaide.com/cama-montessori/p',
  },
  {
    id: 'test-montessori-color',
    title: 'Prueba: Cama Montessori con selección de Color y Medida 1¼ plazas',
    category: 'Producto Real',
    description:
      'Reconoce colores infantiles (Azul, Mostaza, Coral/Rosa, Astra Beige) y medida especial 1¼ plazas (90 × 190 cm, SKU 5455). Permite alternar colores con 1 clic.',
    query: 'cama montessori azul',
    expectedResult:
      'Cama Montessori color Azul. Selectores interactivos de medida (1¼ pl y 1½ pl) y colores reales.',
    officialSkuCheck: 'SKU 5445 / 5455',
  },
  {
    id: 'test-1',
    title: 'Prueba 1: Titanium 2½ plazas (Prioridad)',
    category: 'Producto Real',
    description:
      'Identifica correctamente «titanium 2.5 plazas». Verifica SKU exacto (1913), RefId (20000310), foto oficial, precios y envío gratis automático por superar $350.',
    query: 'titanium 2.5 plazas',
    expectedResult:
      'Colchón Titanium, SKU 1913, 2½ plazas. Promo: $362,58, Normal: $709,55, Descuento: 49%, Ahorro: $346,97. Envío gratis (> $350,00). Total: $362,58.',
    officialSkuCheck: 'SKU 1913 en chaide.com',
  },
  {
    id: 'test-2',
    title: 'Prueba 2: Continental FB 2 plazas',
    category: 'Producto Real',
    description:
      'Reconoce la abreviatura FB como Continental FB (SKU 1767) sin confundir con otros modelos Continental.',
    query: 'continental fb 2 plazas',
    expectedResult:
      'Colchón Continental FB, SKU 1767, 2 plazas. Promo: $264,03, Normal: $425,50, Descuento: 38%. Envío: $6,90 (≤ $350,00). Total: $270,93.',
    officialSkuCheck: 'SKU 1767 en chaide.com',
  },
  {
    id: 'test-3',
    title: 'Prueba 3: Continental Tradicional de Lujo Nueva Generación 2 plazas',
    category: 'Producto Real',
    description:
      'Distingue estrictamente Nueva Generación (SKU 1779) de Continental de Lujo Tradicional (SKU 1763).',
    query: 'continental tradicional nueva generacion 2 plazas',
    expectedResult:
      'Colchón Continental Tradicional de Lujo Nueva Generación, SKU 1779, 2 plazas. Promo: $206,22, Normal: $332,35, Descuento: 38%.',
    officialSkuCheck: 'SKU 1779 en chaide.com',
  },
  {
    id: 'test-4',
    title: 'Prueba 4: Base Chaide Tapiz Chocolate 2 plazas, un cuerpo',
    category: 'Producto Real',
    description:
      'Identifica correctamente el SKU exacto (73) con medida 2 plazas, color Chocolate y 1 cuerpo.',
    query: 'base chaide tapiz chocolate 2 plazas 1 cuerpo',
    expectedResult:
      'Base Chaide Tapiz, SKU 73, 2 plazas, Chocolate, Un cuerpo. Promo: $138,77, Normal: $200,10, Descuento: 31%.',
    officialSkuCheck: 'SKU 73 en chaide.com',
  },
  {
    id: 'test-5',
    title: 'Prueba 5: Solicitud múltiple (2 FB + 1 Base Tapiz)',
    category: 'Producto Real',
    description:
      '«2 fb de 2 plazas y 1 base chaide tapiz chocolate de 2 plazas un cuerpo». Tres unidades en dos líneas, subtotales, ahorro $384,27 y envío gratis (> $350).',
    query: '2 fb de 2 plazas y 1 base chaide tapiz chocolate de 2 plazas un cuerpo',
    expectedResult:
      '2 FB ($528,06) + 1 Base ($138,77) = Subtotal $666,83. Ahorro: $384,27. Envío gratis. Total: $666,83. Listado interno «Códigos SAP para ingreso de pedidos» muestra las referencias comerciales SAP; WhatsApp va sin códigos.',
    officialSkuCheck: '2x FB 2 pl + 1x Base Tapiz 2 pl 1c',
  },
  {
    id: 'test-6',
    title: 'Prueba 6: Errores ortográficos («titaniun 2 plazas y media»)',
    category: 'Producto Real',
    description:
      'Interpreta errores como «titaniun 2 plazas y media», «chn titanium 2 1/2» o «colchon titanum 2,5» asignando correctamente Colchón Titanium 2½ plazas.',
    query: 'titaniun 2 plazas y media',
    expectedResult:
      'Normalizado a Colchón Titanium, 2½ plazas (Código SAP 20000310, SKU interno 1913).',
    officialSkuCheck: 'Corrección automática',
  },
  {
    id: 'test-7',
    title: 'Prueba 7: Buscador de códigos SAP (Pestaña 2)',
    category: 'Buscador SKU',
    description:
      'Búsqueda en Pestaña 2: presenta Código SAP (Referencia), foto oficial, selectores dinámicos de variantes y botones «Copiar código SAP» y «Agregar a cotización».',
    query: 'Colchón Restapedic 1½ plazas',
    targetTab: 'sku-finder',
    expectedResult:
      'Identifica Colchón Restapedic 1½ plaza con Código SAP 20000287 (SKU interno 1867) y copia únicamente 20000287.',
    officialSkuCheck: 'Pestaña Buscador de códigos SAP',
  },
  {
    id: 'test-8',
    title: 'Prueba 8: Documentos para cliente SIN códigos internos',
    category: 'Reglas Visuales',
    description:
      'Ni la cotización visual (PNG/PDF) ni el mensaje de WhatsApp muestran códigos SAP ni SKU internos de VTEX.',
    query: 'continental fb 2 plazas',
    expectedResult:
      'La cotización para cliente muestra foto, nombre, medida, precios y ahorro sin códigos SAP; el listado interno muestra los códigos SAP solo para asesores.',
  },
  {
    id: 'test-9',
    title: 'Prueba 9: Códigos SAP en cotización múltiple',
    category: 'Reglas Visuales',
    description:
      'Al cotizar dos o más productos, «Códigos SAP para ingreso de pedidos» lista todas las referencias SAP exactas con botón «Copiar código» y «Copiar todos los códigos».',
    query: '1 continental fb 2 plazas y 1 titanium 2.5 plazas',
    expectedResult:
      'Muestra las referencias SAP exactas en orden y copia únicamente códigos SAP.',
  },
  {
    id: 'test-10',
    title: 'Prueba 10: WhatsApp NUNCA contiene SKU ni enlaces',
    category: 'Reglas Visuales',
    description:
      'El mensaje generado para WhatsApp sale estrictamente en texto plano, sin códigos SKU, enlaces ni itemId.',
    query: '2 fb de 2 plazas y 1 base chaide tapiz chocolate de 2 plazas un cuerpo',
    expectedResult:
      'Mensaje limpio con emojis, medidas en plazas, precios, ahorro y total. Libre de SKU.',
  },
  {
    id: 'test-11',
    title: 'Prueba 11: Escenarios de Envío y umbral de $350,00',
    category: 'Lógica de Envío',
    description:
      'Lógica automática: $200 → $6,90; $350,00 → $6,90; $350,01 → Gratis; $500 → Gratis; $200 con retiro explícito → Gratis (sin envío).',
    query: 'continental fb 2 plazas con retiro en fábrica',
    expectedResult:
      'Al detectar «retiro en fábrica» u tienda, se omite el envío comercialmente.',
  },
];

export const AcceptanceTestsModal: React.FC<AcceptanceTestsModalProps> = ({
  isOpen,
  onClose,
  onLoadTestCase,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                11 Pruebas de Aceptación Oficiales
              </h2>
              <p className="text-xs text-slate-400">
                Verificación contra el catálogo y reglas de Chaide
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Scrollable Test List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 divide-y divide-slate-100">
          {ACCEPTANCE_TESTS.map((test) => (
            <div key={test.id} className="pt-3.5 first:pt-0 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        test.category === 'Producto Real'
                          ? 'bg-blue-100 text-blue-800'
                          : test.category === 'Buscador SKU'
                          ? 'bg-purple-100 text-purple-800'
                          : test.category === 'Lógica de Envío'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {test.category}
                    </span>
                    {test.officialSkuCheck && (
                      <span className="text-[11px] font-mono text-slate-500">
                        {test.officialSkuCheck}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {test.title}
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {test.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onLoadTestCase({
                      query: test.query,
                      targetTab: test.targetTab,
                    });
                    onClose();
                  }}
                  className="shrink-0 px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <span>Probar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Expected Output block */}
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/70 text-xs text-slate-700 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Resultado Esperado:</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal pl-5 font-mono">
                  {test.expectedResult}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Fuente oficial: VTEX API www.chaide.com</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
