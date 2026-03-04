import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Badge } from "@/shared/components/ui/Badge";
import { tw } from "@/shared/styles/design-system";
import { CreditCard, Plus, Trash2, Star, Building2, ShieldCheck } from "lucide-react";

interface PaymentMethod {
  id: number;
  type: "card" | "bank";
  cardBrand?: "visa" | "mastercard" | "amex";
  lastFourDigits: string;
  holderName: string;
  expiryDate?: string;
  isDefault: boolean;
  bankName?: string;
  accountType?: string;
}

const CARD_STYLES: Record<string, { bg: string; label: string }> = {
  visa:       { bg: 'bg-brand-50 text-brand-600 dark:bg-dark-brand/10 dark:text-dark-brand', label: 'Visa' },
  mastercard: { bg: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400', label: 'Mastercard' },
  amex:       { bg: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400', label: 'Amex' },
};

export function PaymentMethods() {
  const navigate = useNavigate();
  const [showAddCard, setShowAddCard] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { id: 1, type: "card", cardBrand: "visa",       lastFourDigits: "4242", holderName: "Juan Pérez", expiryDate: "12/25", isDefault: true },
    { id: 2, type: "card", cardBrand: "mastercard", lastFourDigits: "8888", holderName: "Juan Pérez", expiryDate: "06/26", isDefault: false },
    { id: 3, type: "bank", lastFourDigits: "1234",  holderName: "Juan Pérez", bankName: "Banco Nación", accountType: "Cuenta Corriente", isDefault: false },
  ]);

  const [newCard, setNewCard] = useState({ cardNumber: "", holderName: "", expiryDate: "", cvv: "" });

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    return cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
  };

  const handleSetDefault = (id: number) =>
    setPaymentMethods(paymentMethods.map((m) => ({ ...m, isDefault: m.id === id })));

  const handleDelete = (id: number) =>
    setPaymentMethods(paymentMethods.filter((m) => m.id !== id));

  const handleAddCard = () => {
    setShowAddCard(false);
    setNewCard({ cardNumber: "", holderName: "", expiryDate: "", cvv: "" });
  };

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-8 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`text-xl min-[375px]:text-2xl font-bold ${tw.text.primary}`}>Métodos de pago</h1>
              <p className={`mt-0.5 text-sm ${tw.text.secondary}`}>
                Administrá tus tarjetas y cuentas
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/client/dashboard")} className="shrink-0 text-xs min-[375px]:text-sm px-3 min-[375px]:px-4 py-1.5 min-[375px]:py-2">
              ← Volver
            </Button>
          </div>

          <div className="space-y-4">

            {/* Agregar */}
            {!showAddCard ? (
              <button
                onClick={() => setShowAddCard(true)}
                className={`
                  flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5
                  transition cursor-pointer text-sm font-medium
                  border-slate-200 dark:border-dark-border
                  ${tw.text.secondary}
                  hover:border-brand-400 dark:hover:border-dark-brand
                  hover:text-brand-600 dark:hover:text-dark-brand
                  hover:bg-brand-50 dark:hover:bg-dark-elevated
                `}
              >
                <Plus className="h-4 w-4" />
                Agregar método de pago
              </button>
            ) : (
              <Card>
                <h2 className={`mb-5 text-base font-semibold ${tw.text.primary}`}>
                  Nueva tarjeta
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className={tw.label}>Número de tarjeta</label>
                    <input
                      type="text"
                      value={newCard.cardNumber}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\s/g, "");
                        if (v.length <= 16 && /^\d*$/.test(v))
                          setNewCard({ ...newCard, cardNumber: formatCardNumber(v) });
                      }}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      className={tw.input}
                    />
                  </div>
                  <div>
                    <label className={tw.label}>Nombre del titular</label>
                    <input
                      type="text"
                      value={newCard.holderName}
                      onChange={(e) => setNewCard({ ...newCard, holderName: e.target.value })}
                      placeholder="Juan Pérez"
                      className={tw.input}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={tw.label}>Vencimiento</label>
                      <input
                        type="text"
                        value={newCard.expiryDate}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, "");
                          if (v.length >= 2) v = v.slice(0, 2) + "/" + v.slice(2, 4);
                          if (v.length <= 5) setNewCard({ ...newCard, expiryDate: v });
                        }}
                        placeholder="MM/AA"
                        maxLength={5}
                        className={tw.input}
                      />
                    </div>
                    <div>
                      <label className={tw.label}>CVV</label>
                      <input
                        type="text"
                        value={newCard.cvv}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "");
                          if (v.length <= 4) setNewCard({ ...newCard, cvv: v });
                        }}
                        placeholder="123"
                        maxLength={4}
                        className={tw.input}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" fullWidth onClick={() => setShowAddCard(false)}>Cancelar</Button>
                    <Button fullWidth onClick={handleAddCard}>Agregar tarjeta</Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Lista */}
            {paymentMethods.length === 0 ? (
              <Card>
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tw.iconBg.slate}`}>
                    <CreditCard className={`h-5 w-5 ${tw.text.faint}`} />
                  </div>
                  <div>
                    <h3 className={`mb-1 text-sm font-semibold ${tw.text.primary}`}>Sin métodos de pago</h3>
                    <p className={`text-xs ${tw.text.secondary}`}>Agregá una tarjeta o cuenta bancaria</p>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((method) => {
                  const cardStyle = method.cardBrand ? CARD_STYLES[method.cardBrand] : null;
                  return (
                    <Card
                      key={method.id}
                      className={method.isDefault ? 'border-brand-200 dark:border-dark-brand/30' : ''}
                    >
                      <div className="flex items-center gap-4">
                        {/* Ícono */}
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
                          ${method.type === 'card' ? (cardStyle?.bg ?? tw.iconBg.slate) : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'}`}>
                          {method.type === 'card'
                            ? <CreditCard className="h-5 w-5" />
                            : <Building2 className="h-5 w-5" />
                          }
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={`text-sm font-semibold truncate ${tw.text.primary}`}>
                              {method.type === 'card'
                                ? `${cardStyle?.label ?? 'Tarjeta'} •••• ${method.lastFourDigits}`
                                : `${method.bankName} •••• ${method.lastFourDigits}`
                              }
                            </p>
                            {method.isDefault && (
                              <Badge variant="success">
                                <Star className="h-2.5 w-2.5 fill-current" />
                                Predeterminada
                              </Badge>
                            )}
                          </div>
                          <p className={`text-xs ${tw.text.secondary}`}>
                            {method.holderName}
                            {method.type === 'card' && method.expiryDate && ` · Vence ${method.expiryDate}`}
                            {method.type === 'bank' && method.accountType && ` · ${method.accountType}`}
                          </p>
                        </div>

                        {/* Acciones */}
                        <div className="flex shrink-0 items-center gap-3">
                          {!method.isDefault && (
                            <button
                              onClick={() => handleSetDefault(method.id)}
                              className={`text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}
                            >
                              Predeterminar
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(method.id)}
                            className={`flex items-center gap-1 text-xs font-medium cursor-pointer transition text-red-500 hover:text-red-600 dark:text-red-400`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Info de seguridad */}
            <div className={`flex items-start gap-3 rounded-2xl border p-4 ${tw.divider} ${tw.infoBox}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tw.iconBg.brand} text-brand-600 dark:text-dark-brand`}>
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className={`text-sm font-semibold ${tw.text.primary}`}>Tus pagos están protegidos</p>
                <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>
                  Todos los métodos están encriptados con tecnología de seguridad bancaria. Nunca compartimos tu información financiera.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
