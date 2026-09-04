/**
 * 启动脚本
 */

var appManager = {
	authReqKey : "", // 授权请求Key
	gameInfo : {},
	sdkInfo : {},
	userInfo : {},

	init : function() {
		var gameId = "";
		var serverId = "";
		var os = "";
		var sid = "";
		try {
			this.gameInfo = sdkB.request(sdkB.servType.COMMON,
					sdkB.actions.GET_GAME_INFO);
			if (!this.gameInfo.success) {
				throw new Error("获取游戏信息异常！");
			}
			this.sdkInfo = sdkB.request(sdkB.servType.COMMON,
					sdkB.actions.GET_SDK_INFO);
			if (!this.sdkInfo.success) {
				throw new Error("获取sdk信息异常！");
			}
			this.userInfo = sdkB.request(sdkB.servType.COMMON,
					sdkB.actions.GET_CURR_USER);
			if (!this.userInfo.success) {
				throw new Error("获取用户信息异常！");
			}
			gameId = this.gameInfo.data.gameId;
			serverId = this.gameInfo.data.serverId;
			os = this.sdkInfo.data.os;
			sid = this.userInfo.data.sid;

		} catch (ex) {
			appManager.log("初始化sdk信息异常", ex);
		}

		var reqData = "gid=" + gameId + "&os=" + os + "&srid=" + serverId
				+ "&sid=" + sid;
		// 加载动态数据(授权支付方式)
		this.authReqKey = SecurityUtil.randomKey(16);
		mainUrl = authUrl + "?" + "data="
				+ this.encAuthReqData(reqData, this.authReqKey);

		// 如果是开发模式，将明文返回授权信息，如果否，将加密传输，返回变量_authData
		if (devMode)
			mainUrl += "&devMode=1";
		var script = document.createElement('script');
		script.src = mainUrl;
		script.onload = this.onLoad;
		$("head").append(script);
	},
	// 加密授权请求的数据
	encAuthReqData : function(data, key) {
		try {
			var ucid = this.userInfo.data.ucid;
			var certStore = new CertStore();
			certStore.load("ugc_cert"); // 从本地存储加载最新的内容
			var sKey = SecurityUtil.rsaEncrypt(key, certStore.get("data"));
			var sData = SecurityUtil.aesEncrypt(data, key);
			return certStore.get("ver") + "|" + sKey + "|" + sData + "|"
					+ Hex.encode(ucid + "");
		} catch (ex) {
			appManager.log("加密授权请求信息异常", ex);
			return "";
		}
	},
	// 授权脚本加载完成后，执行该脚本
	onLoad : function() {
		// 获取渲染脚本
		if (devMode) {
			$("#_js").attr("src",
					updUrl + "?devMode=1&t=" + new Date().getTime());
		} else {
			// 解密返回的授权和会话信息
			if (typeof (_authData) != "undefined" && _authData) {
				try { // 加入异常捕捉，让异步更新js资源必定执行
					var authData = SecurityUtil.aesDecrypt(_authData,
							appManager.authReqKey);
					window.eval(authData);

					// 从H5缓存读取渲染脚本
					var jStore = jsManager.getJStore();
					$("#_js").text(Base64.decode(jStore.get("data")));
					console.log("当前渲染版本: " + jStore.get("ver"));
				} catch (ex) {
					appManager.log("执行本地渲染脚本异常", ex);
				}

				// 进行异步更新渲染脚本
				setTimeout(jsManager.update, 500);
				// 进行异步更新资源(证书、广告、温馨提示、日志打点配置等)
				try {
					setTimeout(resManager.update, 1000);
				} catch (ex) {
					appManager.log("资源更新异常", ex);
				}
			} else {
				// 没有返回授权信息，直接返回游戏
				sdkB.request(sdkB.servType.PAY, sdkB.actions.EXIT_SDK);
			}
		}
	},
	log : function(msg, ex) { // 该方法只能在这个类中使用，是后面加进去的，已经下发的js这个方法
		try {
			var errLogUrl = baseUrl + "/sdk/error.htm";
			var arr = new Array;
			arr.push("v=v3");
			if (this.gameInfo.success) {
				arr.push("gid=" + this.gameInfo.data.gameId);
			}
			if (this.sdkInfo.success) {
				arr.push("sdkInfo=" + JSON.stringify(this.sdkInfo.data));
			}
			if (this.userInfo.success) {
				arr.push("uid=" + Hex.encode(this.userInfo.data.ucid + ""));
			}
			arr.push("errDesc=" + msg);
			if (ex) {
				arr.push("ex=" + ex);
			}

			var data = arr.join("`");
			console.log(data);
			data = Base64.encode(data);
			$.ajax({
				type : "GET",
				url : errLogUrl,
				data : {
					t : new Date().getTime(),
					d : data
				},
				dataType : "jsonp",
				timeout : 30000,
				success : function(rsp) {
					console.log("发送日志错误日志成功");
				},
				error : function(xhr, type) {
					console.log("发送日志错误日志失败");
				}
			});
		} catch (e) {
		}
	}
};

// 渲染脚本管理器
var jsManager = {
	code : "ugc_js", // 本地存储的标识
	getJStore : function() {
		var jStore = new JStore();
		jStore.load(this.code);

		return jStore;
	},
	// 更新渲染脚本
	update : function() {
		try {
			var jStore = jsManager.getJStore();
			if (jStore.needUpdate()) {
				var bTime = new Date();
				// 准备请求的数据
				var gameId = appManager.gameInfo.data.gameId;
				var srcData = "gameId=" + gameId + "&ver=" + jStore.get("ver");
				var reqData = sessionId + "|"
						+ SecurityUtil.aesEncrypt(srcData, sessionKey);
				$.ajax({
					type : "GET",
					url : updUrl + "?data=" + reqData,
					dataType : "jsonp",
					timeout : 30000,
					success : function(rsp) {
						if (rsp.jsData) {
							var jStore = new JStore();
							var data = SecurityUtil.aesDecrypt(rsp.jsData,
									sessionKey);
							//console.log(data);
							if (data) {
								jStore.parse(data);
								jStore.save(jsManager.code);
								console.log("脚本更新: 完成 [版本:" + jStore.get("ver")
										+ ", 耗时:" + (new Date() - bTime)
										+ "ms]");
							}
						}
					},
					error : function(xhr, type) {
						console.log("脚本更新: 网络异常");
					}
				});
			}
		} catch (ex) {
			appManager.log("js脚本更新异常", ex);
		}
	}
};