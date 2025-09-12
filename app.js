// Configuration
//const API_BASE_URL = "https://astrapestore.onrender.com/api";
const API_BASE_URL = "http://localhost:8085/api";
let currentUser = null;
let authToken = null;
let currentPage = "products";
let cartItems = [];
let allProducts = [];
let pendingAddToCart = null;

// Utility Functions
function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

function showPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.style.display = "none";
  });

  const targetPage = document.getElementById(`${pageName}-page`);
  if (targetPage) {
    targetPage.style.display = "block";
    currentPage = pageName;

    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.remove("active");
    });

    // Load page-specific content
    if (pageName === "products") {
      loadProducts();
      loadCategories();
    } else if (pageName === "cart") {
      loadCart();
    } else if (pageName === "login") {
      setTimeout(() => {
        const email = document.getElementById("login-email");
        if (email) email.focus();
      }, 100);
    }
  }
}

// login
async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      currentUser = {
        id: data.userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
      };
      authToken = data.token;

      localStorage.setItem("authToken", authToken);
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      updateAuthUI();
      syncCartFromStorage();

      if (pendingAddToCart) {
        const { itemId, quantity } = pendingAddToCart;
        pendingAddToCart = null;
        await addToCart(itemId, quantity);
      }

      await loadProducts(); // re-render products to update button states
      showPage("products");
      showToast("Login successful!", "success");
    } else {
      showToast(data.message || "Login failed", "error");
    }
  } catch (error) {
    console.error("Login error:", error);
    showToast("Login failed. Please try again.", "error");
  }
}

async function signup(firstName, lastName, email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      currentUser = {
        id: data.userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
      };
      authToken = data.token;

      localStorage.setItem("authToken", authToken);
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      updateAuthUI();
      syncCartFromStorage();
      showPage("products");
      showToast("Account created successfully!", "success");
    } else {
      showToast(data.message || data || "Signup failed", "error");
    }
  } catch (error) {
    console.error("Signup error:", error);
    showToast("Signup failed. Please try again.", "error");
  }
}

function logout() {
  if (authToken && cartItems.length > 0 && currentUser) {
    const cartData = cartItems.map((item) => ({
      itemId: item.item.id,
      quantity: item.quantity,
    }));
    localStorage.setItem(`cart_${currentUser.id}`, JSON.stringify(cartData));
  }

  currentUser = null;
  authToken = null;
  cartItems = [];

  localStorage.removeItem("authToken");
  localStorage.removeItem("currentUser");

  updateAuthUI();
  updateCartCount();
  showPage("products");
  showToast("Logged out successfully", "info");
}

function updateAuthUI() {
  const authButtons = document.getElementById("auth-buttons");
  const userMenu = document.getElementById("user-menu");
  const userName = document.getElementById("user-name");

  if (currentUser) {
    if (authButtons) authButtons.style.display = "none";
    if (userMenu) userMenu.style.display = "flex";
    if (userName)
      userName.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
  } else {
    if (authButtons) authButtons.style.display = "flex";
    if (userMenu) userMenu.style.display = "none";
  }
}

// OAuth2 Functions
function loginWithGoogle() {
  console.log("Initiating Google OAuth2 login...");
  window.location.href = `${API_BASE_URL.replace(
    "/api",
    ""
  )}/oauth2/authorization/google`;
}

function loginWithGitHub() {
  console.log("Initiating GitHub OAuth2 login...");
  window.location.href = `${API_BASE_URL.replace(
    "/api",
    ""
  )}/oauth2/authorization/github`;
}

// Handle OAuth2 redirect
function handleOAuth2Redirect() {
  console.log("Handling OAuth2 redirect...");
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  const error = urlParams.get("error");
  const email = urlParams.get("email");
  const firstName = urlParams.get("firstName");
  const lastName = urlParams.get("lastName");
  const userId = urlParams.get("userId");

  console.log("OAuth2 redirect params:", {
    token: !!token,
    error,
    email,
    firstName,
    lastName,
    userId,
  });

  if (error) {
    console.error("OAuth2 error:", error);
    showToast("OAuth2 login failed: " + error, "error");
    showPage("login");
    return;
  }

  if (token && email && firstName && lastName && userId) {
    console.log("OAuth2 login successful, storing user data...");

    // Store OAuth2 user data
    currentUser = {
      id: parseInt(userId),
      email: email,
      firstName: firstName,
      lastName: lastName,
    };
    authToken = token;

    // Store in localStorage for persistence
    localStorage.setItem("authToken", authToken);
    localStorage.setItem("currentUser", JSON.stringify(currentUser));

    updateAuthUI();
    syncCartFromStorage();
    showPage("products");
    showToast("Login successful!", "success");

    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    console.warn("OAuth2 redirect missing required parameters");
    showPage("login");
  }
}

// Load OAuth2 providers dynamically
async function loadOAuth2Providers() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/oauth2/providers`);
    if (response.ok) {
      const providers = await response.json();
      console.log("Available OAuth2 providers:", providers);
    }
  } catch (error) {
    console.error("Error loading OAuth2 providers:", error);
  }
}

// Product Functions
async function loadProducts() {
  try {
    const response = await fetch(`${API_BASE_URL}/items`);
    const products = await response.json();

    allProducts = products;
    renderProducts(products);
    updateProductsCount(products.length);
  } catch (error) {
    console.error("Error loading products:", error);
    showToast("Failed to load products", "error");
  }
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/items/categories`);
    const categories = await response.json();

    const categoryFilter = document.getElementById("category-filter");
    if (!categoryFilter) return;
    categoryFilter.innerHTML = '<option value="">All Categories</option>';

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categoryFilter.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading categories:", error);
  }
}

function renderProducts(products) {
  const productsGrid = document.getElementById("products-grid");
  if (!productsGrid) return;

  productsGrid.innerHTML = "";
  if (!products || products.length === 0) {
    productsGrid.innerHTML = '<div class="loading">No products found</div>';
    return;
  }

  products.forEach((product) => {
    const card = document.createElement("div");
    card.className = "product-card";

    const img = document.createElement("img");
    img.className = "product-image";
    img.alt = product.name || "Product";
    img.src =
      product.imageUrl || "https://via.placeholder.com/300x200?text=No+Image";
    img.onerror = () =>
      (img.src = "https://via.placeholder.com/300x200?text=No+Image");

    const info = document.createElement("div");
    info.className = "product-info";

    const cat = document.createElement("div");
    cat.className = "product-category";
    cat.textContent = product.category || "";

    const h3 = document.createElement("h3");
    h3.className = "product-name";
    h3.textContent = product.name || "";

    const desc = document.createElement("p");
    desc.className = "product-description";
    desc.textContent = product.description || "";

    const priceDiv = document.createElement("div");
    priceDiv.className = "product-price";
    priceDiv.textContent = formatPrice(product.price || 0);

    const stockDiv = document.createElement("div");
    let stockClass = "";
    if (product.stock < 10) {
      stockClass = product.stock === 0 ? "out" : "low";
    }
    stockDiv.className = `product-stock ${stockClass}`;
    stockDiv.textContent =
      product.stock === 0 ? "Out of Stock" : `${product.stock} in stock`;

    const btn = document.createElement("button");
    btn.className = "btn btn-primary btn-full";

    if (product.stock === 0) {
      btn.disabled = true;
      btn.textContent = "Out of Stock";
    } else {
      if (!currentUser) {
        btn.textContent = "Login to Add to Cart";
        btn.addEventListener("click", () => redirectToLogin(product.id));
      } else {
        btn.textContent = "Add to Cart";
        btn.addEventListener("click", () => addToCart(product.id));
      }
    }

    // assemble
    info.appendChild(cat);
    info.appendChild(h3);
    info.appendChild(desc);
    info.appendChild(priceDiv);
    info.appendChild(stockDiv);
    info.appendChild(btn);

    card.appendChild(img);
    card.appendChild(info);

    productsGrid.appendChild(card);
  });
}

function updateProductsCount(count) {
  const productsCount = document.getElementById("products-count");
  if (productsCount) productsCount.textContent = `${count} products found`;
}

async function applyFilters() {
  const category = document.getElementById("category-filter").value;
  const search = document.getElementById("search-filter").value;
  const minPrice = document.getElementById("min-price").value;
  const maxPrice = document.getElementById("max-price").value;

  try {
    const params = new URLSearchParams();
    if (category) params.append("category", category);
    if (search) params.append("name", search);
    if (minPrice) params.append("minPrice", minPrice);
    if (maxPrice) params.append("maxPrice", maxPrice);

    const response = await fetch(`${API_BASE_URL}/items?${params.toString()}`);
    const products = await response.json();

    renderProducts(products);
    updateProductsCount(products.length);
  } catch (error) {
    console.error("Error applying filters:", error);
    showToast("Failed to apply filters", "error");
  }
}

function clearFilters() {
  const cf = document.getElementById("category-filter");
  const sf = document.getElementById("search-filter");
  const mp = document.getElementById("min-price");
  const xp = document.getElementById("max-price");
  if (cf) cf.value = "";
  if (sf) sf.value = "";
  if (mp) mp.value = "";
  if (xp) xp.value = "";

  renderProducts(allProducts);
  updateProductsCount(allProducts.length);
}

function redirectToLogin(itemId, quantity = 1) {
  pendingAddToCart = { itemId, quantity };
  showToast("Please login to add items to cart", "info");
  setTimeout(() => {
    showPage("login");
    const email = document.getElementById("login-email");
    if (email) email.focus();
  }, 300);
}

// Cart Functions
async function addToCart(itemId, quantity = 1) {
  authToken = authToken || localStorage.getItem("authToken");

  if (!authToken) {
    redirectToLogin(itemId, quantity);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/cart/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ itemId, quantity }),
    });

    if (response.ok) {
      await loadCart();
      showToast("Item added to cart!", "success");
      // refresh products to update button state if needed
      await loadProducts();
    } else {
      const errorText = await response.text();
      showToast(errorText || "Failed to add item to cart", "error");
    }
  } catch (error) {
    console.error("Error adding to cart:", error);
    showToast("Failed to add item to cart", "error");
  }
}

async function loadCart() {
  authToken = authToken || localStorage.getItem("authToken");
  if (!authToken) {
    cartItems = [];
    renderCart();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/cart`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok) {
      cartItems = await response.json();
      renderCart();
      updateCartCount();
    } else {
      cartItems = [];
      renderCart();
    }
  } catch (error) {
    console.error("Error loading cart:", error);
    cartItems = [];
    renderCart();
  }
}

function renderCart() {
  const cartItemsContainer = document.getElementById("cart-items");
  const cartSummary = document.getElementById("cart-summary");
  if (!cartItemsContainer || !cartSummary) return;

  if (cartItems.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="cart-empty">
        <i class="fas fa-shopping-cart"></i>
        <h3>Your cart is empty</h3>
        <p>Add some products to get started</p>
        <button onclick="showPage('products')" class="btn btn-primary">Continue Shopping</button>
      </div>
    `;
    cartSummary.style.display = "none";
    return;
  }

  cartItemsContainer.innerHTML = cartItems
    .map(
      (cartItem) => `
        <div class="cart-item">
          <img src="${cartItem.item.imageUrl}" alt="${
        cartItem.item.name
      }" class="cart-item-image"
               onerror="this.src='https://via.placeholder.com/80x80?text=No+Image'">
          <div class="cart-item-info">
              <h4>${cartItem.item.name}</h4>
              <p>${cartItem.item.category}</p>
          </div>
          <div class="cart-item-price">${formatPrice(cartItem.item.price)}</div>
          <div class="quantity-controls">
              <button class="quantity-btn" onclick="updateCartItemQuantity(${
                cartItem.item.id
              }, ${
        cartItem.quantity - 1
      })"><i class="fas fa-minus"></i></button>
              <span class="quantity-display">${cartItem.quantity}</span>
              <button class="quantity-btn" onclick="updateCartItemQuantity(${
                cartItem.item.id
              }, ${cartItem.quantity + 1})"><i class="fas fa-plus"></i></button>
          </div>
          <button onclick="removeFromCart(${
            cartItem.item.id
          })" class="btn btn-danger btn-sm">
              <i class="fas fa-trash"></i>
          </button>
        </div>
      `
    )
    .join("");

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.item.price * item.quantity,
    0
  );

  document.getElementById("total-items").textContent = totalItems;
  document.getElementById("total-amount").textContent =
    formatPrice(totalAmount);
  cartSummary.style.display = "block";
}

async function updateCartItemQuantity(itemId, newQuantity) {
  if (!authToken) return;

  if (newQuantity <= 0) {
    removeFromCart(itemId);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/cart/update`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ itemId, quantity: newQuantity }),
    });

    if (response.ok) {
      await loadCart();
    } else {
      showToast("Failed to update cart item", "error");
    }
  } catch (error) {
    console.error("Error updating cart item:", error);
    showToast("Failed to update cart item", "error");
  }
}

async function removeFromCart(itemId) {
  if (!authToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/cart/remove/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok) {
      await loadCart();
      showToast("Item removed from cart", "info");
    } else {
      showToast("Failed to remove item from cart", "error");
    }
  } catch (error) {
    console.error("Error removing from cart:", error);
    showToast("Failed to remove item from cart", "error");
  }
}

async function clearCart() {
  if (!authToken || cartItems.length === 0) return;
  if (!confirm("Are you sure you want to clear your cart?")) return;

  try {
    const response = await fetch(`${API_BASE_URL}/cart/clear`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok) {
      cartItems = [];
      renderCart();
      updateCartCount();
      showToast("Cart cleared", "info");
    } else {
      showToast("Failed to clear cart", "error");
    }
  } catch (error) {
    console.error("Error clearing cart:", error);
    showToast("Failed to clear cart", "error");
  }
}

// Checkout
async function checkoutCart() {
  authToken = authToken || localStorage.getItem("authToken");
  if (!authToken || cartItems.length === 0) {
    showToast("Your cart is empty!", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/cart/checkout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok) {
      cartItems = [];
      renderCart();
      updateCartCount();
      showToast("🎉 Order placed successfully!", "success");
      showPage("products");
    } else {
      const msg = await response.text().catch(() => null);
      showToast(msg || "Checkout failed. Try again.", "error");
    }
  } catch (error) {
    console.error("Error during checkout:", error);
    showToast("Checkout failed. Try again.", "error");
  }
}

function updateCartCount() {
  const cartCount = document.getElementById("cart-count");
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  if (cartCount) cartCount.textContent = totalItems;
}

function syncCartFromStorage() {
  if (!currentUser || !authToken) return;

  const storedCart = localStorage.getItem(`cart_${currentUser.id}`);
  if (!storedCart) return;

  try {
    const cartData = JSON.parse(storedCart);
    cartData.forEach(async (item) => {
      await addToCart(item.itemId, item.quantity);
    });
    localStorage.removeItem(`cart_${currentUser.id}`);
  } catch (error) {
    console.error("Error syncing cart from storage:", error);
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", function () {
  const storedToken = localStorage.getItem("authToken");
  const storedUser = localStorage.getItem("currentUser");

  if (storedToken && storedUser) {
    authToken = storedToken;
    currentUser = JSON.parse(storedUser);
    updateAuthUI();
    loadCart();
  }

  showPage("products");

  document
    .getElementById("login-form")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;
      await login(email, password);
    });

  document
    .getElementById("signup-form")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const firstName = document.getElementById("signup-firstname").value;
      const lastName = document.getElementById("signup-lastname").value;
      const email = document.getElementById("signup-email").value;
      const password = document.getElementById("signup-password").value;
      await signup(firstName, lastName, email, password);
    });

  document
    .getElementById("search-filter")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") applyFilters();
    });
});

window.addEventListener("error", function (e) {
  console.error("Global error:", e.error);
  showToast("An unexpected error occurred", "error");
});
