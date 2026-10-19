(function (global) {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function toast(message, type) {
    var box = $("#toast-wrap");
    if (!box) return;
    var el = document.createElement("div");
    el.className = "toast toast-" + (type || "info");
    el.textContent = message;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add("show");
    }, 10);
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () {
        el.remove();
      }, 250);
    }, 3200);
  }

  function openModal(id) {
    var m = typeof id === "string" ? $(id) : id;
    if (!m) return;
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    var m = typeof id === "string" ? $(id) : id;
    if (!m) return;
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var modal = $("#confirm-modal");
      $("#confirm-title").textContent = opts.title || "Xác nhận";
      $("#confirm-message").textContent = opts.message || "Bạn chắc chắn?";
      $("#confirm-ok").textContent = opts.okText || "Đồng ý";
      $("#confirm-cancel").textContent = opts.cancelText || "Hủy";
      openModal(modal);
      function cleanup(result) {
        $("#confirm-ok").removeEventListener("click", onOk);
        $("#confirm-cancel").removeEventListener("click", onCancel);
        closeModal(modal);
        resolve(result);
      }
      function onOk() {
        cleanup(true);
      }
      function onCancel() {
        cleanup(false);
      }
      $("#confirm-ok").addEventListener("click", onOk);
      $("#confirm-cancel").addEventListener("click", onCancel);
    });
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  global.QLNH = global.QLNH || {};
  global.QLNH.ui = {
    $: $,
    $all: $all,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    setText: setText,
  };
})(window);
