(function($, window, undefined) {

/**
* Webtop Namespace
* uses closure for private members
*/
var Webtop = (function() {
		//Private methods and properties
		var tasks = [], //array of current tasks
			handlers = [], //array of event handlers
			z = 0, //z-index counter
			guid = 1, //unique ID for general use
			doc = window.document,
			PX = "px",
			//Webtop = Webtop, //for minification
			consts = {
				HEADER_HEIGHT: 25, //height of window header in PX
				DEFAULT: 1,
				MAXIMIZED: 2,
				
				//Events
				NEW_TASK: 0,
				RIGHT_CLICK: 1,
				TASK_MINIMIZED: 3,
				TASK_MAXIMIZED: 4,
				TASK_RESTORED: 5
			};
		
		
		
		//Public methods and properties
		return {
		
			/**
			* Get a running app by its task index
			* @param id Task index
			* @return Object manipulation methods
			*/
			get: function(id) {
				var app = tasks[id];
				return {
					close: function() {
						if(app) {
							doc.body.removeChild(app.node);
							delete tasks[id]; //remove from tasks array
							z--;
						}
					},
					
					maximize: function() {
						if(app.state !== Webtop.c('MAXIMIZED')) {
							$(app.node).css({width: "100%", height: "100%", left: "0px", top: "0px"});
							$("div.window-inner",app.node).css({height: "100%", width: "100%"});
							app.state = Webtop.c('MAXIMIZED');
							app.node.style.zIndex = z++;
							
							$(app.node).draggable("option","disabled", true).resizable("option", "disabled", true);
						} else {
							this.restore();
							$(app.node).draggable("option","disabled", false).resizable("option", "disabled", false);
						}
					},
					
					minimize: function() {
						$(app.node).hide("fast");
						app.state *= -1; //flip the state
					},
					
					focus: function() {
						$(app.node).show("fast");
						app.node.style.zIndex = z++;
					},
					
					restore: function() {
						this.focus();
						if(app.state === Webtop.c('MAXIMIZED')) { //if task wasn't maximized
							$(app.node).css({width: app.dim.w, height: app.dim.h + PX, left: app.dim.x + PX, top: app.dim.y + PX});
							
							var w = $('div.window-inner', app.node),
								h = w.hasClass("full") ? 0 : Webtop.c('HEADER_HEIGHT'); //if has class full, header isn't visible
							
							w.css({width: app.dim.w, height:app.dim.h - h + PX});
							app.state = Webtop.c('DEFAULT');
						}
						app.state = Math.abs(app.state);
					},
					
					props: {
						x: app.dim.x,
						y: app.dim.y,
						w: app.dim.w,
						h: app.dim.h,
						state: app.state
					}
				};
			},
		
			run: function(id) {
				//Create the root DIV
				var obj = doc.createElement("div"), 
					options = APPLIST[id],
					index = tasks.length;
				
				if(options.single) { //if single instance, look for one opened
					var found = this.api.findTask(id);
					if(found) {
						this.get(found[0]).restore();
						return;
					}
				}
				
				obj.id = "app"+index;
				$(obj).addClass("window").css({width: options.width, height: options.height + PX, zIndex: (options.alwaysOntop ? 1000 : z++)})
					  .html(div({"class": "window-header"}, strong(options.title), span(a({"class": "min"},"[-]"),a({"class": "max"},"[_]"),a({"class": "close"},"[x]")))+div({"class": "window-inner loading"}));
				
				//apply user defined CSS on the main window
				if(options.css) {
					$(obj).css(options.css);
				}
				//push the task to the task list
				tasks.push({id: id, node: obj, dim: {w: options.width, h: options.height, x: 10, y: 10}, state: Webtop.c('DEFAULT')});
				
				//create the iframe
				var iframe = doc.createElement("iframe"), inner = $('div.window-inner', obj);
				
				$(iframe).attr({frameBorder: '0', allowTransparency: 'true', src: "app.php?id="+id+"&c="+(new Date()).getTime() }).hide();
				//iframe.src = "http://280slides.com/Editor/";
				//iframe.src = "http://sketch.processing.org/";
				
				inner.append(iframe).css("height", options.height - Webtop.c('HEADER_HEIGHT') + PX);
				
				//Remove the header
				if(options.header === false) {
					$('div.window-header',obj).addClass("hidden");
					inner.addClass("full").css("height",options.height);
				}
				doc.body.appendChild(obj);
				
				//Create closure of apps window controls
				var controls = this.get(tasks.length-1);
				$("a.min",obj).click(function(){ controls.minimize(); });
				$("a.max",obj).click(function(){ controls.maximize(); });
				$("a.close",obj).click(function() { controls.close(); });
				
				//Give the iframe access to Webtop
				var iwin = iframe.contentWindow || iframe.contentDocument.defaultView;
				iwin.Webtop = Webtop;
				iwin.App = controls;
				
				$(iframe).load(function() {
					inner.removeClass("loading");
					$(iframe).show();
				});
				
				//Add events
				var _preventDefault = function(evt) { evt.preventDefault(); },
					startGhost = function(context) { $("iframe", context).hide(); $(context).addClass("drag"); },
					stopGhost = function(context) { $("iframe", context).show(); $(context).removeClass("drag"); };
				$("div.window-header", obj)
					.bind("dragstart", _preventDefault)
					.bind("selectstart", _preventDefault)
					.bind("mousedown", function() { controls.focus(); })
					.dblclick(function() { controls.maximize(); });
				
				
				if(options.draggable !== false) {
					$(obj).draggable({handle: "div.window-header", scroll:false, containment:'document',
						start: function() {
							startGhost(this);
						},
						
						stop: function() {
							stopGhost(this);
							//update the position of the task
							tasks[index].dim.x = parseInt($(this).css("left"),10);
							tasks[index].dim.y = parseInt($(this).css("top"),10);
						}
					});
				}
				
				if(options.resizable !== false) {
					$(obj).resizable({containment:'document', autoHide: true, alsoResize: inner,
						start: function() {
							startGhost(this);
							if(tasks[index].state === Webtop.c('MAXIMIZED')) {
								controls.maximize();
							}
						}, 
						stop: function() {
							stopGhost(this);
							//update the dimensions of the task
							tasks[index].dim.w = $(this).css("width");
							tasks[index].dim.h = parseInt($(this).css("height"),10);
						}
					});
				}
				//last but not least, fire event
				Webtop.events.dispatch(Webtop.c('NEW_TASK')); 
			},
			
			api: {
				findTask: function(id) {
					var found = [], i = 0, l;
					for(l = tasks.length; i < l; i++) {
						if(tasks[i] && tasks[i].id === id) {
							found.push(i);
						}
					}
					return found.length > 0 ? found : false;
				},
				
				getTasks: function() {
					return tasks;
				},
				
				taskOptions: function(id) {
					return APPLIST[id];
				}
			},
			
			events: {
			
				attach: function(obj, id, handler) {
					if(handlers[id] === undefined) handlers[id] = []; //init handler array
					handlers[id].push({obj: obj, handler: handler});
					
				},
				
				dispatch: function(id, value) {
					
					var h = handlers[id], i = 0, l, attached;
					console.log(h);
					if(h !== undefined) {
						for(l = h.length; i<l; i++) {
							attached = h[i];
							console.log('dispatch time', attached, attached.handler.toString());
							attached.handler.call(attached.obj);
						}
					}
				}
			},
			
			/**
			* Return a constant
			*/
			c: function(name) {
				return consts[name];
			}
		};
})();


window.Webtop = Webtop;
})(jQuery, window);