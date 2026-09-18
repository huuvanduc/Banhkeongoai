const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    value,
  );
const escapeHTML = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
const categories = {
  snacks: "Bánh & kẹo",
  chocolate: "Chocolate",
  skincare: "Chăm sóc da",
  supplements: "Thực phẩm bổ sung",
};
const state = {
  products: [],
  cart: new Map(),
  session: null,
  store: null,
  acceptingOrders: false,
  category: "all",
  brand: "all",
  sort: "featured",
  query: "",
  adminProducts: [],
  adminOrders: [],
  adminSettings: null,
  launch: null,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || "Không thể kết nối máy chủ.",
    );
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }
  return payload;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3500);
}
function openDialog(selector) {
  const dialog = $(selector);
  if (!dialog.open) dialog.showModal();
}
function closeDialog(selector) {
  const dialog = $(selector);
  if (dialog.open) dialog.close();
}
function findProduct(id) {
  return state.products.find((product) => product.id === id);
}
function cartItems() {
  return [...state.cart]
    .map(([id, quantity]) => ({ ...findProduct(id), quantity }))
    .filter((item) => item.name);
}
function subtotal() {
  return cartItems().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function filteredProducts() {
  let products = state.products.filter(
    (product) =>
      state.category === "all" || product.category === state.category,
  );
  if (state.brand !== "all")
    products = products.filter((product) => product.brand === state.brand);
  const query = state.query.trim().toLocaleLowerCase("vi");
  if (query)
    products = products.filter((product) =>
      `${product.name} ${product.brand}`
        .toLocaleLowerCase("vi")
        .includes(query),
    );
  return products.sort((a, b) =>
    state.sort === "price-asc"
      ? a.price - b.price
      : state.sort === "price-desc"
        ? b.price - a.price
        : state.sort === "name"
          ? a.name.localeCompare(b.name, "vi")
          : Number(b.featured) - Number(a.featured),
  );
}

function renderCatalog() {
  const products = filteredProducts();
  $("#result-count").textContent = `${products.length} sản phẩm`;
  $("#product-grid").innerHTML = products
    .map(
      (product) =>
        `<article class="product-card"><button class="product-image" data-detail="${product.id}" aria-label="Xem ${escapeHTML(product.name)}"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy">${product.featured ? '<span class="badge">Nổi bật</span>' : ""}</button><div class="product-meta"><span>${escapeHTML(product.brand)}</span><span>${escapeHTML(categories[product.category])}</span></div><h3><button data-detail="${product.id}">${escapeHTML(product.name)}</button></h3><p class="muted small">${escapeHTML(product.size)}</p><div class="product-bottom"><strong>${money(product.price)}</strong><button class="add-button" data-add="${product.id}" ${product.stock < 1 ? "disabled" : ""}>${product.stock < 1 ? "Hết hàng" : "Thêm +"}</button></div></article>`,
    )
    .join("");
  $("#no-results").hidden = products.length > 0;
  $$("[data-category]").forEach((button) =>
    button.classList.toggle(
      "active",
      button.dataset.category === state.category,
    ),
  );
  $("#reset-filters").hidden =
    state.category === "all" && state.brand === "all" && !state.query;
  $("#hero-products").innerHTML = state.products
    .filter((product) => product.featured)
    .slice(0, 3)
    .map(
      (product) =>
        `<img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}">`,
    )
    .join("");
}

function renderBrands() {
  const brands = [
    ...new Set(state.products.map((product) => product.brand)),
  ].sort((a, b) => a.localeCompare(b, "vi"));
  $("#brand").innerHTML =
    '<option value="all">Tất cả thương hiệu</option>' +
    brands.map((brand) => `<option>${escapeHTML(brand)}</option>`).join("");
}
function chooseCategory(category) {
  state.category = category;
  renderCatalog();
  $("#catalog").scrollIntoView({ behavior: "smooth" });
}
function clearFilters() {
  state.category = "all";
  state.brand = "all";
  state.query = "";
  $("#search").value = "";
  $("#brand").value = "all";
  renderCatalog();
}

function productDetail(id) {
  const product = findProduct(id);
  if (!product) return;
  const health =
    product.category === "supplements"
      ? state.store?.supplement_disclaimer
      : product.category === "skincare"
        ? state.store?.skincare_disclaimer
        : "";
  $("#product-detail").innerHTML =
    `<div class="detail-image"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"></div><div class="detail-copy"><span class="eyebrow">${escapeHTML(product.brand)} · ${escapeHTML(categories[product.category])}</span><h2 id="product-title">${escapeHTML(product.name)}</h2><p class="detail-size">${escapeHTML(product.size)}</p><strong class="detail-price">${money(product.price)}</strong><p>${escapeHTML(product.description)}</p>${product.ingredients ? `<p><b>Thành phần:</b> ${escapeHTML(product.ingredients)}</p>` : ""}${product.allergens ? `<p><b>Dị ứng:</b> ${escapeHTML(product.allergens)}</p>` : ""}${product.directions ? `<p><b>Hướng dẫn:</b> ${escapeHTML(product.directions)}</p>` : ""}${product.warnings ? `<p><b>Lưu ý:</b> ${escapeHTML(product.warnings)}</p>` : ""}${health ? `<p class="notice">${escapeHTML(health)}</p>` : ""}<button class="button primary full" data-add="${product.id}" ${product.stock < 1 ? "disabled" : ""}>${product.stock < 1 ? "Hết hàng" : "Thêm vào giỏ"}</button></div>`;
  openDialog("#product-dialog");
}

function addToCart(id) {
  const product = findProduct(id);
  if (!product || product.stock < 1) return toast("Sản phẩm hiện đã hết hàng.");
  state.cart.set(id, Math.min((state.cart.get(id) || 0) + 1, product.stock));
  renderCart();
  toast("Đã thêm vào giỏ hàng.");
}
function changeQuantity(id, delta) {
  const product = findProduct(id);
  const next = (state.cart.get(id) || 0) + delta;
  if (!product || next <= 0) state.cart.delete(id);
  else state.cart.set(id, Math.min(next, product.stock));
  renderCart();
}

function renderCart() {
  const items = cartItems();
  $("#cart-count").textContent = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  if (!items.length) {
    $("#cart-content").innerHTML =
      '<div class="empty-state"><h3>Giỏ hàng đang trống</h3><p>Thêm một món yêu thích để bắt đầu.</p><button class="button primary" id="continue-shopping">Khám phá cửa hàng ↗</button></div>';
    return;
  }
  $("#cart-content").innerHTML =
    items
      .map(
        (item) =>
          `<div class="cart-row"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}"><div><h3>${escapeHTML(item.name)}</h3><span class="muted small">${escapeHTML(item.size)} · ${money(item.price)}</span><div class="row-bottom"><div class="quantity"><button data-qty="${item.id}" data-delta="-1">−</button><span>${item.quantity}</span><button data-qty="${item.id}" data-delta="1" ${item.quantity >= item.stock ? "disabled" : ""}>+</button></div><strong class="small">${money(item.price * item.quantity)}</strong><button class="remove" data-remove="${item.id}">Xóa</button></div></div></div>`,
      )
      .join("") +
    `<div class="cart-total"><div class="sum-row total"><span>Tạm tính</span><strong>${money(subtotal())}</strong></div><p class="notice">Phí vận chuyển được máy chủ lấy từ đơn vị vận chuyển khi đặt hàng.</p><button class="button primary full" id="start-checkout" ${state.acceptingOrders ? "" : "disabled"}>${state.acceptingOrders ? "Tiếp tục đặt hàng" : "Cửa hàng chưa nhận đơn"}</button></div>`;
}

function startCheckout() {
  if (!state.acceptingOrders)
    return toast("Cửa hàng chưa hoàn tất điều kiện để nhận đơn.");
  if (!state.cart.size) return;
  $("#checkout-summary").innerHTML = `<h3>Đơn hàng của bạn</h3>${cartItems()
    .map(
      (item) =>
        `<div class="summary-item"><img src="${escapeHTML(item.image)}" alt=""><div>${escapeHTML(item.name)}<small>${escapeHTML(item.size)} × ${item.quantity}</small></div><strong>${money(item.price * item.quantity)}</strong></div>`,
    )
    .join(
      "",
    )}<div class="sum-row total"><span>Tạm tính</span><strong>${money(subtotal())}</strong></div>`;
  if (state.session?.role === "customer") {
    const form = $("#checkout-form");
    form.elements.name.value ||= state.session.name;
    form.elements.email.value ||= state.session.email;
  }
  closeDialog("#cart-dialog");
  openDialog("#checkout-dialog");
}

async function placeOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  const data = Object.fromEntries(new FormData(form));
  try {
    const result = await api("/api/orders", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID().replaceAll("-", "") },
      body: JSON.stringify({
        items: cartItems().map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        customer: {
          name: data.name,
          email: data.email || "",
          phone: data.phone,
        },
        shipping: {
          province: data.province,
          ward: data.ward,
          address: data.address,
        },
        note: data.note || "",
        paymentMethod: data.payment,
      }),
    });
    state.cart.clear();
    renderCart();
    closeDialog("#checkout-dialog");
    $("#order-result").innerHTML =
      `<div class="result-symbol">✓</div><h2 id="result-title">Đơn hàng ${escapeHTML(result.order.order_number)} đã được giữ chỗ</h2><p>Bạn sẽ được chuyển tới trang thanh toán bảo mật của nhà cung cấp.</p><a class="button primary full" href="${escapeHTML(result.order.payment_checkout_url)}">Tiếp tục thanh toán ↗</a>`;
    openDialog("#result-dialog");
  } catch (error) {
    toast(error.message);
  } finally {
    submit.disabled = false;
  }
}

function renderAccount() {
  const user = state.session;
  $("#account-guest").hidden = Boolean(user);
  $("#account-session").hidden = !user;
  $("#account-label").textContent = user
    ? user.name.split(/\s+/).at(-1)
    : "Đăng nhập";
  if (!user) return;
  $("#account-avatar").textContent = user.name.charAt(0).toUpperCase();
  $("#session-name").textContent = user.name;
  $("#session-email").textContent = user.email;
  $("#session-role").textContent =
    user.role === "admin" ? "Chủ cửa hàng" : "Khách hàng";
  $("#open-dashboard").hidden = user.role !== "admin";
}
function showAuthTab(id) {
  for (const tab of ["login", "register", "admin-login"]) {
    $("#" + tab + "-tab").setAttribute("aria-selected", String(id === tab));
    $("#" + tab + "-form").hidden = id !== tab;
  }
  $("#account-title").textContent =
    id === "register"
      ? "Đăng ký khách hàng"
      : id === "admin-login"
        ? "Đăng nhập chủ cửa hàng"
        : "Đăng nhập";
}
async function submitLogin(form) {
  const data = Object.fromEntries(new FormData(form));
  const result = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: data.email, password: data.password }),
  });
  state.session = result.user;
  renderAccount();
  form.reset();
  closeDialog("#account-dialog");
  toast("Đăng nhập thành công.");
}
async function submitRegister(form) {
  const data = Object.fromEntries(new FormData(form));
  if (data.password !== data.confirm)
    throw new Error("Hai mật khẩu chưa khớp.");
  const result = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      password: data.password,
    }),
  });
  state.session = result.user;
  renderAccount();
  form.reset();
  closeDialog("#account-dialog");
  toast("Đã tạo tài khoản.");
}

function showInfo(type) {
  const store = state.store || {};
  const content = {
    about: [
      "Về cửa hàng",
      store.legal_name
        ? `${store.legal_name}. Thông tin doanh nghiệp đã được cung cấp bởi chủ cửa hàng.`
        : "Thông tin doanh nghiệp đang được chủ cửa hàng hoàn thiện.",
    ],
    shipping: [
      "Giao hàng & đổi trả",
      [store.shipping_policy, store.returns_policy]
        .filter(Boolean)
        .join("\n\n") ||
        "Chính sách chưa được công bố; cửa hàng chưa nhận đơn.",
    ],
    privacy: [
      "Thông tin cá nhân",
      store.privacy_policy ||
        "Chính sách quyền riêng tư chưa được công bố; cửa hàng chưa nhận đơn.",
    ],
    contact: [
      "Liên hệ",
      [store.legal_name, store.public_phone, store.public_email, store.address]
        .filter(Boolean)
        .join("\n") || "Thông tin liên hệ đang được xác minh.",
    ],
  }[type];
  $("#info-content").innerHTML =
    `<span class="eyebrow">THÔNG TIN CỬA HÀNG</span><h2 id="info-title">${escapeHTML(content[0])}</h2><p class="info-preline">${escapeHTML(content[1])}</p>`;
  openDialog("#info-dialog");
}

function installAdminFields() {
  $("#admin-setup-fields").hidden = true;
  $("#admin-confirm-label").hidden = true;
  $("#admin-auth-submit").textContent = "Đăng nhập quản trị";
  $("#admin-auth-help").textContent =
    "Tài khoản quản trị chỉ được tạo bằng lệnh máy chủ.";
  $("#account-dialog > .notice").textContent =
    "Tài khoản được xác thực an toàn trên máy chủ. Không chia sẻ mật khẩu hoặc mã đăng nhập.";
  $("#admin-dialog > .notice").textContent =
    "Khu vực này yêu cầu vai trò quản trị trên máy chủ. Mọi thay đổi được lưu vào cơ sở dữ liệu và ghi nhật ký.";
  $("#admin-title").textContent = "Quản lý cửa hàng";
  $("#open-admin").textContent = "Quản lý cửa hàng ↗";
  $("#orders-tab").childNodes[0].textContent = "Đơn hàng ";
  $("#product-editor-form [name=expiry]").closest("label").hidden = true;
  $("#orders-tab").insertAdjacentHTML(
    "beforebegin",
    '<button role="tab" aria-selected="false" id="settings-tab" aria-controls="admin-settings" tabindex="-1">Cửa hàng & chính sách</button>',
  );
  $("#admin-orders").insertAdjacentHTML(
    "afterend",
    '<section id="admin-settings" role="tabpanel" aria-labelledby="settings-tab" hidden></section>',
  );
  $("#product-editor-form button[type=submit]").insertAdjacentHTML(
    "beforebegin",
    `<div class="form-row"><label>Khối lượng giao hàng (g)<input name="weightGrams" type="number" min="1" required></label><label>Trạng thái<select name="status"><option value="draft">Bản nháp</option><option value="active">Đang bán</option><option value="archived">Lưu trữ</option></select></label></div><div class="form-row"><label>Nguồn ảnh / giấy phép<input name="photoSource" maxlength="1000"></label><label>Quốc gia xuất xứ<input name="originCountry" maxlength="80"></label></div><label>Thành phần<textarea name="ingredients" maxlength="4000" rows="3"></textarea></label><label>Thông tin dị ứng<textarea name="allergens" maxlength="2000" rows="2"></textarea></label><label>Hướng dẫn dùng<textarea name="directions" maxlength="2000" rows="2"></textarea></label><label>Cảnh báo<textarea name="warnings" maxlength="2000" rows="2"></textarea></label><label>Bảo quản<textarea name="storage" maxlength="1000" rows="2"></textarea></label><div class="form-row"><label>Mã lô<input name="batchNumber" maxlength="100"></label><label>Hạn dùng<input name="expiresAt" type="date"></label></div><label class="check-label"><input name="photoAuthorized" type="checkbox"> Đã xác minh quyền sử dụng ảnh thương mại</label><label class="check-label"><input name="recordVerified" type="checkbox"> Đã đối chiếu hồ sơ với nhãn/lô thực tế</label>`,
  );
}

async function loadAdmin() {
  const [products, orders, settings] = await Promise.all([
    api("/api/admin/products"),
    api("/api/admin/orders"),
    api("/api/admin/settings"),
  ]);
  state.adminProducts = products.products;
  state.adminOrders = orders.orders;
  state.adminSettings = settings.settings;
  state.launch = settings.launch;
  renderAdmin();
}
function renderAdmin() {
  $("#order-count").textContent = state.adminOrders.length;
  $("#admin-products").innerHTML =
    state.adminProducts
      .map(
        (product) =>
          `<article class="admin-product-row ${product.status !== "active" ? "is-hidden" : ""}"><img src="${escapeHTML(product.image_url || "./favicon.svg")}" alt=""><div><h3>${escapeHTML(product.name)}</h3><span class="small muted">${escapeHTML(product.brand)} · ${product.status} · ${product.record_verified && product.photo_authorized ? "đã xác minh" : "chưa đủ hồ sơ"}</span></div><div><strong>${money(product.price_vnd)}</strong><p>Tồn: ${product.stock}</p></div><button class="button secondary" data-edit-open="${product.id}">Sửa</button></article>`,
      )
      .join("") ||
    '<div class="empty-state"><h3>Chưa có sản phẩm đã xác minh</h3><p>Thêm hồ sơ sản phẩm thật để bắt đầu.</p></div>';
  $("#admin-orders").innerHTML =
    state.adminOrders
      .map(
        (order) =>
          `<article class="admin-order"><header><strong>${escapeHTML(order.order_number)}</strong><strong>${money(order.total_vnd)}</strong></header><p>${escapeHTML(order.customer_name)} · ${escapeHTML(order.customer_phone)}</p><p>${escapeHTML(order.status)} · ${escapeHTML(order.payment_status)}</p></article>`,
      )
      .join("") || '<div class="empty-state"><h3>Chưa có đơn hàng</h3></div>';
  renderSettings();
}

function renderSettings() {
  const s = state.adminSettings || {};
  const blockers = state.launch?.blockers || [];
  $("#admin-settings").innerHTML =
    `<div class="notice"><strong>${state.launch?.ready ? "Sẵn sàng nhận đơn" : "Chưa thể nhận đơn"}</strong>${blockers.length ? `<br>Còn thiếu: ${escapeHTML(blockers.join(", "))}` : ""}</div><form id="settings-form" class="auth-form"><div class="form-row"><label>Tên pháp lý / hộ kinh doanh<input name="legalName" maxlength="200" value="${escapeHTML(s.legal_name || "")}"></label><label>Số điện thoại công khai<input name="publicPhone" maxlength="30" value="${escapeHTML(s.public_phone || "")}"></label></div><div class="form-row"><label>Email công khai<input name="publicEmail" type="email" maxlength="100" value="${escapeHTML(s.public_email || "")}"></label><label>Facebook / trang chính thức<input name="facebookUrl" type="url" maxlength="1000" value="${escapeHTML(s.facebook_url || "")}"></label></div><label>Địa chỉ kinh doanh<textarea name="address" maxlength="500" rows="2">${escapeHTML(s.address || "")}</textarea></label><label>Chính sách quyền riêng tư<textarea name="privacyPolicy" maxlength="20000" rows="5">${escapeHTML(s.privacy_policy || "")}</textarea></label><label>Chính sách giao hàng<textarea name="shippingPolicy" maxlength="20000" rows="5">${escapeHTML(s.shipping_policy || "")}</textarea></label><label>Chính sách đổi trả<textarea name="returnsPolicy" maxlength="20000" rows="5">${escapeHTML(s.returns_policy || "")}</textarea></label><label>Lưu ý thực phẩm bổ sung<textarea name="supplementDisclaimer" maxlength="5000" rows="3">${escapeHTML(s.supplement_disclaimer || "")}</textarea></label><label>Lưu ý chăm sóc da<textarea name="skincareDisclaimer" maxlength="5000" rows="3">${escapeHTML(s.skincare_disclaimer || "")}</textarea></label><label class="check-label"><input name="shippingEnabled" type="checkbox" ${s.shipping_enabled ? "checked" : ""}> Đã kiểm tra kết nối vận chuyển</label><label class="check-label"><input name="paymentEnabled" type="checkbox" ${s.payment_enabled ? "checked" : ""}> Đã kiểm tra kết nối thanh toán</label><label class="check-label"><input name="acceptingOrders" type="checkbox" ${s.accepting_orders ? "checked" : ""}> Yêu cầu mở nhận đơn (chỉ có hiệu lực khi không còn mục thiếu)</label><button class="button primary full" type="submit">Lưu thông tin cửa hàng</button></form>`;
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const result = await api("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({
      legalName: data.legalName || null,
      publicPhone: data.publicPhone || null,
      publicEmail: data.publicEmail || null,
      address: data.address || null,
      facebookUrl: data.facebookUrl || null,
      privacyPolicy: data.privacyPolicy || null,
      shippingPolicy: data.shippingPolicy || null,
      returnsPolicy: data.returnsPolicy || null,
      supplementDisclaimer: data.supplementDisclaimer || null,
      skincareDisclaimer: data.skincareDisclaimer || null,
      shippingEnabled: form.elements.shippingEnabled.checked,
      paymentEnabled: form.elements.paymentEnabled.checked,
      acceptingOrders: form.elements.acceptingOrders.checked,
    }),
  });
  state.adminSettings = result.settings;
  state.launch = result.launch;
  renderSettings();
  await loadStorefront();
  toast("Đã lưu thông tin cửa hàng.");
}

function openProductEditor(id) {
  const form = $("#product-editor-form");
  const product = state.adminProducts.find((item) => item.id === id);
  form.reset();
  form.elements.id.value = product?.id || "";
  $("#editor-title").textContent = product ? "Sửa sản phẩm" : "Thêm sản phẩm";
  const values = product
    ? {
        name: product.name,
        brand: product.brand,
        category: product.category,
        size: product.size,
        price: product.price_vnd,
        stock: product.stock,
        image: product.image_url || "",
        description: product.description,
        weightGrams: product.weight_grams,
        status: product.status,
        photoSource: product.photo_source || "",
        originCountry: product.origin_country || "",
        ingredients: product.ingredients || "",
        allergens: product.allergens || "",
        directions: product.directions || "",
        warnings: product.warnings || "",
        storage: product.storage || "",
        batchNumber: product.batch_number || "",
        expiresAt: product.expires_at?.slice(0, 10) || "",
      }
    : { stock: 0, weightGrams: 100, status: "draft", category: "snacks" };
  for (const [key, value] of Object.entries(values))
    if (form.elements[key]) form.elements[key].value = value;
  form.elements.featured.checked = Boolean(product?.featured);
  form.elements.photoAuthorized.checked = Boolean(product?.photo_authorized);
  form.elements.recordVerified.checked = Boolean(product?.record_verified);
  openDialog("#product-editor-dialog");
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const slug = data.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const body = {
    slug,
    name: data.name,
    brand: data.brand,
    category: data.category,
    size: data.size,
    description: data.description,
    price: Number(data.price),
    stock: Number(data.stock),
    weightGrams: Number(data.weightGrams),
    status: data.status,
    featured: form.elements.featured.checked,
    image: data.image || null,
    photoSource: data.photoSource || null,
    photoAuthorized: form.elements.photoAuthorized.checked,
    recordVerified: form.elements.recordVerified.checked,
    originCountry: data.originCountry || null,
    ingredients: data.ingredients || null,
    allergens: data.allergens || null,
    directions: data.directions || null,
    warnings: data.warnings || null,
    storage: data.storage || null,
    batchNumber: data.batchNumber || null,
    expiresAt: data.expiresAt || null,
  };
  const id = data.id;
  await api(id ? `/api/admin/products/${id}` : "/api/admin/products", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(body),
  });
  closeDialog("#product-editor-dialog");
  await Promise.all([loadAdmin(), loadStorefront()]);
  toast("Đã lưu sản phẩm trên máy chủ.");
}

function adminTab(id) {
  for (const tab of ["products", "settings", "orders"]) {
    const selected = id === `${tab}-tab`;
    $(`#${tab}-tab`).setAttribute("aria-selected", String(selected));
    $(`#${tab}-tab`).tabIndex = selected ? 0 : -1;
    $(`#admin-${tab}`).hidden = !selected;
  }
}
async function loadStorefront() {
  const [products, store, auth] = await Promise.all([
    api("/api/products"),
    api("/api/store"),
    api("/api/auth/me"),
  ]);
  state.products = products.products;
  state.store = store.store;
  state.acceptingOrders = store.acceptingOrders;
  state.session = auth.user;
  renderBrands();
  renderCatalog();
  renderCart();
  renderAccount();
  const note = $(".demo-note");
  note.querySelector(".demo-tag").textContent = state.acceptingOrders
    ? "ĐANG NHẬN ĐƠN"
    : "CHƯA MỞ BÁN";
  note.lastElementChild.textContent = state.acceptingOrders
    ? "Sản phẩm, phí vận chuyển và thanh toán được xử lý trên máy chủ."
    : "Cửa hàng chỉ hiển thị sản phẩm đã xác minh và chưa nhận đơn cho đến khi hoàn tất cấu hình.";
  const checkoutNotice = $(".checkout-body > div > .notice");
  checkoutNotice.textContent = state.acceptingOrders
    ? "Giá, tồn kho và phí vận chuyển sẽ được xác nhận lại an toàn trên máy chủ."
    : "Cửa hàng chưa nhận đơn cho đến khi hoàn tất sản phẩm, chính sách, vận chuyển và thanh toán.";
  $("#checkout-form button[type=submit]").innerHTML =
    'Tiếp tục đến thanh toán bảo mật <span aria-hidden="true">→</span>';
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.hasAttribute("data-close"))
      return button.closest("dialog").close();
    if (button.dataset.category) return chooseCategory(button.dataset.category);
    if (button.dataset.detail) return productDetail(button.dataset.detail);
    if (button.dataset.add) return addToCart(button.dataset.add);
    if (button.dataset.qty)
      return changeQuantity(button.dataset.qty, Number(button.dataset.delta));
    if (button.dataset.remove) {
      state.cart.delete(button.dataset.remove);
      return renderCart();
    }
    if (button.dataset.info) return showInfo(button.dataset.info);
    if (button.dataset.editOpen)
      return openProductEditor(button.dataset.editOpen);
    if (["login-tab", "register-tab", "admin-login-tab"].includes(button.id))
      return showAuthTab(button.id.replace("-tab", ""));
    if (button.id === "open-account") {
      renderAccount();
      openDialog("#account-dialog");
    } else if (button.id === "open-cart") {
      renderCart();
      openDialog("#cart-dialog");
    } else if (button.id === "continue-shopping") {
      closeDialog("#cart-dialog");
      $("#catalog").scrollIntoView();
    } else if (button.id === "start-checkout") startCheckout();
    else if (["clear-search", "reset-filters"].includes(button.id))
      clearFilters();
    else if (button.id === "about-link") showInfo("about");
    else if (button.id === "logout") {
      await api("/api/auth/logout", { method: "POST" });
      state.session = null;
      renderAccount();
    } else if (["open-admin", "open-dashboard"].includes(button.id)) {
      if (state.session?.role !== "admin") {
        showAuthTab("admin-login");
        openDialog("#account-dialog");
      } else {
        await loadAdmin();
        closeDialog("#account-dialog");
        openDialog("#admin-dialog");
      }
    } else if (button.id === "add-product") openProductEditor();
    else if (["products-tab", "settings-tab", "orders-tab"].includes(button.id))
      adminTab(button.id);
  } catch (error) {
    toast(error.message);
  }
});

$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("#catalog").scrollIntoView();
});
$("#search").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderCatalog();
});
$("#sort").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderCatalog();
});
$("#brand").addEventListener("change", (event) => {
  state.brand = event.target.value;
  renderCatalog();
});
$("#checkout-form").addEventListener("submit", placeOrder);
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitLogin(event.currentTarget);
  } catch (error) {
    toast(error.message);
  }
});
$("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitLogin(event.currentTarget);
  } catch (error) {
    toast(error.message);
  }
});
$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await submitRegister(event.currentTarget);
  } catch (error) {
    toast(error.message);
  }
});
$("#product-editor-form").addEventListener("submit", async (event) => {
  try {
    await saveProduct(event);
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "settings-form") return;
  try {
    await saveSettings(event);
  } catch (error) {
    toast(error.message);
  }
});

installAdminFields();
loadStorefront().catch((error) => {
  console.error(error);
  toast("Không thể tải dữ liệu cửa hàng. Vui lòng thử lại.");
});
