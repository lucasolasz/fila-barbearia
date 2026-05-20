import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

interface ClientItem {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

function stripMask(phone: string) {
  return phone.replace(/\D/g, "");
}

function applyPhoneMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function handlePhoneChange(
  e: React.ChangeEvent<HTMLInputElement>,
  setter: (v: string) => void
) {
  setter(applyPhoneMask(e.target.value));
}

export default function AdminClients() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const auth = sessionStorage.getItem("barber_admin_auth");
    if (auth !== "true") {
      navigate("/admin");
      return;
    }
    fetchClients();
  }, [navigate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  async function fetchClients() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, created_at")
        .order("name", { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao buscar clientes");
    } finally {
      setLoading(false);
    }
  }

  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const term = searchTerm.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term)
    );
  }, [clients, searchTerm]);

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(start, start + itemsPerPage);
  }, [filteredClients, currentPage]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);

  function startEdit(client: ClientItem) {
    setEditingId(client.id);
    setEditName(client.name);
    setEditPhone(applyPhoneMask(client.phone));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
  }

  async function saveEdit() {
    if (!editingId) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast.error("Nome é obrigatório");
      return;
    }

    const rawPhone = stripMask(editPhone).trim();

    setSaving(true);
    try {
      const { error } = await supabase
        .from("customers")
        .update({ name: trimmedName, phone: rawPhone })
        .eq("id", editingId);

      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe um cliente com este telefone");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Cliente atualizado!");
      setClients((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? { ...c, name: trimmedName, phone: rawPhone }
            : c
        )
      );
      cancelEdit();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao atualizar cliente");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(id: string) {
    setDeletingId(id);
    setConfirmDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deletingId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", deletingId);

      if (error) throw error;

      toast.success("Cliente excluído!");
      setClients((prev) => prev.filter((c) => c.id !== deletingId));
      setConfirmDeleteOpen(false);
      setDeletingId(null);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao excluir cliente. Verifique se não há atendimentos vinculados.");
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    setNewName("");
    setNewPhone("");
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    setNewName("");
    setNewPhone("");
  }

  async function handleAdd() {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      toast.error("Nome é obrigatório");
      return;
    }

    const rawPhone = stripMask(newPhone).trim();

    setAdding(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({ name: trimmedName, phone: rawPhone })
        .select("id, name, phone, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe um cliente com este telefone");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Cliente adicionado!");
      setClients((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      closeAdd();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao adicionar cliente");
    } finally {
      setAdding(false);
    }
  }

  function formatPhone(phone: string) {
    if (!phone || phone.startsWith("manual_")) return "—";
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 13 && digits.startsWith("55")) {
      const ddd = digits.slice(2, 4);
      const prefix = digits.slice(4, 9);
      const suffix = digits.slice(9);
      return `(${ddd}) ${prefix}-${suffix}`;
    }
    if (digits.length === 11) {
      const ddd = digits.slice(0, 2);
      const prefix = digits.slice(2, 7);
      const suffix = digits.slice(7);
      return `(${ddd}) ${prefix}-${suffix}`;
    }
    return phone;
  }

  if (loading && clients.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const deletingClient = deletingId
    ? clients.find((c) => c.id === deletingId)
    : null;

  return (
    <div className="min-h-screen bg-neutral-950 pb-20">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/admin")}
              className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 transition-colors"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-2">
              <Users className="h-6 w-6 text-emerald-600" />
              <h1 className="text-xl font-bold text-white">
                Clientes Cadastrados
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-sm text-neutral-400">
              {filteredClients.length} cliente{filteredClients.length !== 1 && "s"}
            </span>
            <button
              onClick={openAdd}
              className="flex items-center space-x-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Novo</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 space-y-6">
        <div className="rounded-3xl bg-neutral-900 p-6 shadow-sm border border-neutral-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-700 bg-neutral-800 pl-10 pr-10 text-sm text-white outline-none focus:border-emerald-500 focus:bg-neutral-900 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-neutral-900 shadow-sm border border-neutral-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-800 border-b border-neutral-700">
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-500">
                    Nome
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-500">
                    Telefone
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-500">
                    Cadastro
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-neutral-500 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {paginatedClients.map((client) =>
                  editingId === client.id ? (
                    <tr
                      key={client.id}
                      className="bg-neutral-800/50"
                    >
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-9 w-full rounded-lg border border-emerald-500 bg-neutral-900 px-3 text-sm text-white outline-none focus:border-emerald-400"
                          autoFocus
                        />
                      </td>
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editPhone}
                          onChange={(e) => handlePhoneChange(e, setEditPhone)}
                          placeholder="(00) 00000-0000"
                          className="h-9 w-full rounded-lg border border-emerald-500 bg-neutral-900 px-3 text-sm text-white outline-none focus:border-emerald-400"
                        />
                      </td>
                      <td className="px-6 py-3 text-sm text-neutral-500">
                        —
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {saving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Salvar"
                            )}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-bold text-neutral-300 hover:bg-neutral-600 transition-colors disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={client.id}
                      className="hover:bg-neutral-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-white">
                          {client.name}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-400">
                        {formatPhone(client.phone)}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-500">
                        {format(new Date(client.created_at), "dd/MM/yy HH:mm", {
                          locale: ptBR,
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => startEdit(client)}
                            className="rounded-lg bg-neutral-800 p-2 text-neutral-400 hover:bg-emerald-900/30 hover:text-emerald-400 transition-colors"
                            title="Editar"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(client.id)}
                            className="rounded-lg bg-neutral-800 p-2 text-neutral-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {filteredClients.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-600">
              <Search className="mb-4 h-12 w-12 opacity-20" />
              <p className="font-medium">Nenhum cliente encontrado</p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between rounded-3xl bg-neutral-900 p-4 shadow-sm border border-neutral-800 gap-4">
            <p className="text-sm text-neutral-400">
              Mostrando{" "}
              <span className="font-bold text-white">
                {(currentPage - 1) * itemsPerPage + 1}
              </span>{" "}
              a{" "}
              <span className="font-bold text-white">
                {Math.min(currentPage * itemsPerPage, filteredClients.length)}
              </span>{" "}
              de{" "}
              <span className="font-bold text-white">
                {filteredClients.length}
              </span>{" "}
              clientes
            </p>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center rounded-xl bg-neutral-800 px-3 py-2 text-sm font-bold text-neutral-300 transition-all hover:bg-neutral-700 disabled:opacity-50"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Anterior
              </button>
              <span className="text-sm font-bold text-neutral-400">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="flex items-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                Próxima
                <ChevronRight className="ml-1 h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Novo Cliente */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Novo cliente</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-neutral-500">
                  Nome
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="Nome do cliente"
                  autoFocus
                  className="h-10 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 text-sm text-white outline-none focus:border-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-neutral-500">
                  Telefone
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newPhone}
                  onChange={(e) => handlePhoneChange(e, setNewPhone)}
                  placeholder="(00) 00000-0000"
                  className="h-10 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 text-sm text-white outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
            <div className="mt-6 flex space-x-3">
              <button
                onClick={closeAdd}
                disabled={adding}
                className="flex-1 rounded-xl bg-neutral-700 py-3 text-sm font-bold text-neutral-300 hover:bg-neutral-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Adicionar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar exclusão */}
      {confirmDeleteOpen && deletingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Confirmar exclusão</h3>
            <p className="mt-2 text-sm text-neutral-400">
              Tem certeza que deseja excluir o cliente{" "}
              <span className="font-bold text-white">
                {deletingClient.name}
              </span>
              ? Esta ação não pode ser desfeita.
            </p>
            <div className="mt-6 flex space-x-3">
              <button
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setDeletingId(null);
                }}
                disabled={saving}
                className="flex-1 rounded-xl bg-neutral-700 py-3 text-sm font-bold text-neutral-300 hover:bg-neutral-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Excluir"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
